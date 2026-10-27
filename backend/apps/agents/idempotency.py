"""Agent 写动作的统一幂等执行器。

设计（Phase 7）：
- 先占位 `(token, key)`（status_code=0），再执行业务；并发同键只有一个能插入；
- 同键不同 action / 不同请求体 → 409，绝不回放错误响应；
- 成功响应落库，失败/异常回滚占位，允许客户端修正后重试；
- 24h TTL，过期记录惰性清理；
- SQLite 无行锁，唯一约束 + SAVEPOINT 仍是最终兜底（Django 文档明确
  `select_for_update` 在 SQLite 上无效果）。
"""

import hashlib
import json

from django.core.serializers.json import DjangoJSONEncoder
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response

from apps.agents.models import IDEMPOTENCY_TTL, AgentToken, IdempotencyRecord

IDEM_HEADER = "HTTP_IDEMPOTENCY_KEY"
MAX_KEY_LENGTH = 120


class IdempotencyConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "同一个 Idempotency-Key 不能用于不同的动作或请求体。"
    default_code = "idempotency_conflict"


def request_fingerprint(request, action: str) -> str:
    """动作 + 请求体的稳定指纹；JSON key 排序，避免字段顺序造成假冲突。"""
    try:
        body = request.data
    except Exception:  # 无请求体/解析失败时仍按动作指纹处理
        body = {}
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(f"{action}:{canonical}".encode()).hexdigest()


def _replay(record: IdempotencyRecord, action: str, fingerprint: str) -> Response:
    if record.action != action or (record.request_hash and record.request_hash != fingerprint):
        raise IdempotencyConflict()
    if record.status_code == 0:
        raise IdempotencyConflict("相同 Idempotency-Key 的请求仍在处理中，请稍后重试。")
    return Response(record.response, status=record.status_code)


def execute_idempotent(request, action: str, fn):
    """执行一个 Agent 写动作；带幂等键时按上述协议回放/拒绝。"""
    key = request.META.get(IDEM_HEADER)
    token = request.auth
    if not key or not isinstance(token, AgentToken):
        return fn()
    if len(key) > MAX_KEY_LENGTH:
        raise ValidationError({"Idempotency-Key": [f"最长 {MAX_KEY_LENGTH} 字符。"]})

    fingerprint = request_fingerprint(request, action)
    now = timezone.now()

    with transaction.atomic():
        record = IdempotencyRecord.objects.select_for_update().filter(token=token, key=key).first()
        if record is not None and record.is_expired:
            record.delete()
            record = None
        if record is not None:
            return _replay(record, action, fingerprint)

        try:
            # SAVEPOINT：并发插入失败只回滚这条 INSERT，外层事务仍可读已提交记录。
            with transaction.atomic():
                record = IdempotencyRecord.objects.create(
                    token=token,
                    key=key,
                    action=action,
                    request_hash=fingerprint,
                    status_code=0,
                    response={},
                    expires_at=now + IDEMPOTENCY_TTL,
                )
        except IntegrityError:
            record = IdempotencyRecord.objects.select_for_update().get(token=token, key=key)
            return _replay(record, action, fingerprint)

        response = fn()
        if response.status_code >= 400:
            # 业务拒绝不缓存：客户端修正参数后可用同一个 key 重试。
            record.delete()
            return response

        record.status_code = response.status_code
        record.response = json.loads(json.dumps(response.data, cls=DjangoJSONEncoder))
        record.save(update_fields=["status_code", "response", "updated_at"])
        return response
