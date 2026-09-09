"""运维类接口（Sprint 0：健康检查）。

装饰器顺序说明：@extend_schema 必须在 @api_view 上方
（DRF 3.18 api_view 闭包化后，放在下方会被静默丢弃）。
"""

import logging

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
    },
}


@extend_schema(
    operation_id="health_check",
    summary="健康检查",
    description="探测服务与数据库连接状态；数据库不可达时返回 503。供本地验证与后续容器编排使用。",
    responses={
        200: OpenApiResponse(response=_HEALTH_RESPONSE_SCHEMA),
        503: OpenApiResponse(response=_HEALTH_RESPONSE_SCHEMA),
    },
    auth=[],
)
@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """返回服务与数据库健康状态（BACKEND_PLAN Sprint 0 验收项）。"""
    database_ok = True
    try:
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT 1")
    except DatabaseError:
        logger.exception("health check: database unreachable")
        database_ok = False

    body = {
        "status": "ok" if database_ok else "error",
        "database": "ok" if database_ok else "error",
    }
    return Response(
        body,
        status=status.HTTP_200_OK if database_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
    )
