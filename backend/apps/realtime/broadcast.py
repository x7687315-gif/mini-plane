"""实时广播（契约 docs/api/08-realtime.md）。

**刻意只做两个事件**（计划 §Sprint 7 明确收窄范围，不做"全站广播"这种用不上的能力）：
- `issue.updated`：payload 与 06 契约的活动 diff 同构，前端**复用同一套文案渲染**
- `comment.created`：正文直接带上，前端不用再回查评论接口

两处设计：
1. 消息体一律 `json_safe`（UUID→str、datetime→ISO8601），与 HTTP 响应体的序列化规则一致；
2. 服务层发起广播必须走 `defer_*`（内部 `transaction.on_commit`）——
   否则消费者会收到一条"数据库里还不存在"的变更（Sprint 6 的 on_commit 教训直接沿用）。
"""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

from core.cache import json_safe

logger = logging.getLogger(__name__)

GROUP_PREFIX = "project"

EVENT_ISSUE_UPDATED = "issue.updated"
EVENT_COMMENT_CREATED = "comment.created"

#: 客户端能收到的事件集合（契约 08 的权威清单）
KNOWN_EVENTS = (EVENT_ISSUE_UPDATED, EVENT_COMMENT_CREATED)


def project_group(project_id) -> str:
    """项目频道的组名。前端不需要知道这个，只关心 URL 与事件名。

    **组名不能用冒号**：Channels 只允许 ASCII 字母数字、连字符、下划线、点号
    （实测 TypeError）。所以用 `project.{uuid}` 而不是 `project:{uuid}`。
    """
    return f"project.{project_id}"


def broadcast(project_id, event: str, payload: dict) -> None:
    """立即广播（仅供基础设施/测试/消费者内部使用；服务层请用 `defer_*`）。"""
    layer = get_channel_layer()
    if layer is None:  # pragma: no cover - 未配置 channel layer 时的兜底
        logger.warning("channel layer 未配置，事件 %s 丢弃", event)
        return
    async_to_sync(layer.group_send)(
        project_group(project_id),
        {"type": "project.event", **json_safe({"event": event, "payload": payload})},
    )


def defer(project_id, event: str, payload: dict) -> None:
    """事务提交后再广播（服务层的正确入口）。"""
    transaction.on_commit(lambda: broadcast(project_id, event, payload))


def defer_issue_updated(*, project_id, issue, old_value=None, new_value=None) -> None:
    """Issue 字段变更（06 契约的 diff 结构，只有真正变化的字段）。"""
    defer(
        project_id,
        EVENT_ISSUE_UPDATED,
        {
            "issue_id": str(issue.id),
            "sequence_id": issue.sequence_id,
            "old_value": old_value,
            "new_value": new_value,
        },
    )


def defer_comment_created(*, project_id, issue, comment, author) -> None:
    """新评论（带正文与作者摘要，前端无需二次请求）。"""
    defer(
        project_id,
        EVENT_COMMENT_CREATED,
        {
            "issue_id": str(issue.id),
            "sequence_id": issue.sequence_id,
            "comment_id": str(comment.id),
            "author": {"id": str(author.id), "username": author.username},
            "content": comment.content,
        },
    )
