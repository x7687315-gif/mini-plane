"""统一异常处理（契约 docs/api/00-conventions.md §2）。

在 DRF 默认处理之上只做两件事，保持行为可解释：
1. 未认证且不带任何凭证 → 401（DRF 对 Session 认证默认给 403，不符合契约）；
2. 未被 DRF 识别的异常 → 统一 500 响应体，并记录完整堆栈（不泄漏给客户端）。
"""

import logging

from rest_framework import exceptions as drf_exceptions
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)

    if response is None:
        # 未经 DRF 处理的异常（如数据库故障、代码缺陷）：记日志 + 统一文案
        logger.exception("Unhandled API exception: %r", exc)
        return Response(
            {"detail": "服务器内部错误。"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if (
        response.status_code == status.HTTP_403_FORBIDDEN
        and getattr(exc, "default_code", "") == drf_exceptions.NotAuthenticated.default_code
    ):
        # "已进入需认证接口，但请求本身没带任何凭证" → 401 更准确
        response.status_code = status.HTTP_401_UNAUTHORIZED

    return response
