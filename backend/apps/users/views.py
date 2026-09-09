"""Auth 接口（docs/api/01-auth.md）。

装饰器顺序（重要）：@extend_schema 必须放在 @api_view 上方。
DRF 3.18 的 api_view 会把原函数封进 handler 闭包，不再透传函数属性；
drf-spectacular 0.30 依赖"装饰 as_view 产物 → 写入 cls.kwargs['schema']"
这条通道注入扩展 schema。放在下方会静默丢失（schema 里没有该端点）。
"""

import logging

from django.contrib.auth import authenticate, login, logout
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.users import services
from apps.users.serializers import LoginSerializer, RegisterSerializer, UserSerializer

logger = logging.getLogger(__name__)

_TOO_MANY_ATTEMPTS = {"detail": "尝试次数过多，请 15 分钟后再试。"}
_INVALID_CREDENTIALS = {"detail": "用户名或密码错误。"}
_CSRF_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {"detail": {"type": "string", "example": "CSRF cookie 已设置。"}},
}


@extend_schema(
    summary="获取 CSRF Cookie",
    description="写操作（POST/PATCH/DELETE）前调用：服务端种下 csrftoken cookie，"
    "前端读取后以 X-CSRFToken 请求头回传。",
    responses={200: OpenApiResponse(response=_CSRF_RESPONSE_SCHEMA)},
    auth=[],
)
@api_view(["GET"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf_cookie(request):
    """种下 csrftoken cookie（联调节奏见 00-conventions §4）。"""
    return Response({"detail": "CSRF cookie 已设置。"})


@extend_schema(
    summary="注册（成功后自动登录）",
    request=RegisterSerializer,
    responses={201: UserSerializer},
    auth=[],
)
@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    """注册即登录：创建用户后种下 session，省一次登录往返。"""
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    login(request, user)
    return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@extend_schema(
    summary="登录",
    request=LoginSerializer,
    responses={200: UserSerializer},
    auth=[],
)
@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """会话登录。失败不区分"用户不存在/密码错误"，并按用户名做失败锁定。"""
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    username = serializer.validated_data["username"]
    password = serializer.validated_data["password"]

    if services.is_locked(username):
        logger.warning("login locked: username=%s ip=%s", username, request.META.get("REMOTE_ADDR"))
        return Response(_TOO_MANY_ATTEMPTS, status=status.HTTP_429_TOO_MANY_REQUESTS)

    user = authenticate(request, username=username, password=password)
    if user is None:
        services.record_failure(username)
        logger.warning("login failed: username=%s ip=%s", username, request.META.get("REMOTE_ADDR"))
        return Response(_INVALID_CREDENTIALS, status=status.HTTP_400_BAD_REQUEST)

    services.reset(username)
    login(request, user)
    return Response(UserSerializer(user).data)


@extend_schema(summary="登出", request=None, responses={204: None})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """销毁 session；需要 X-CSRFToken 头（SessionAuthentication 强制校验）。"""
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(summary="当前用户", responses={200: UserSerializer})
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    """返回当前登录用户；未登录由统一异常处理转为 401。"""
    return Response(UserSerializer(request.user).data)
