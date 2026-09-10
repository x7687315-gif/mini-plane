"""运维类接口（健康检查）。

装饰器顺序说明：@extend_schema 必须在 @api_view 上方
（DRF 3.18 api_view 闭包化后，放在下方会被静默丢弃）。
"""

import logging

from django.core.cache import cache
from django.db import DatabaseError, connections
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger(__name__)

_HEALTH_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["ok", "error"]},
        "database": {"type": "string", "enum": ["ok", "error"]},
        "cache": {"type": "string", "enum": ["ok", "error"]},
    },
}


def _check_cache() -> bool:
    """写/读/删各一次，验证缓存后端可用（Sprint 6：LocMem 或 Redis）。"""
    probe_key = "mini:health:probe"
    try:
        cache.set(probe_key, 1, 10)
        if cache.get(probe_key) != 1:
            return False
        cache.delete(probe_key)
        return True
    except Exception:  # noqa: BLE001 - 健康检查必须把任何后端异常降级成 "error"
        logger.exception("health check: cache unreachable")
        return False


@extend_schema(
    operation_id="health_check",
    summary="健康检查",
    description=(
        "探测服务、数据库与缓存状态；数据库或缓存不可达时返回 503。供本地验证与后续容器编排使用。"
    ),
    responses={
        200: OpenApiResponse(response=_HEALTH_RESPONSE_SCHEMA),
        503: OpenApiResponse(response=_HEALTH_RESPONSE_SCHEMA),
    },
    auth=[],
)
@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """返回服务 / 数据库 / 缓存健康状态（Sprint 0 建立雏形，Sprint 6 加入缓存探测）。"""
    database_ok = True
    try:
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT 1")
    except DatabaseError:
        logger.exception("health check: database unreachable")
        database_ok = False

    cache_ok = _check_cache()

    healthy = database_ok and cache_ok
    body = {
        "status": "ok" if healthy else "error",
        "database": "ok" if database_ok else "error",
        "cache": "ok" if cache_ok else "error",
    }
    return Response(
        body,
        status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
    )
