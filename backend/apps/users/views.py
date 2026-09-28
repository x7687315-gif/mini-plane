"""Auth 接口（docs/api/01-auth.md）。

装饰器顺序（重要）：@extend_schema 必须放在 @api_view 上方。
DRF 3.18 的 api_view 会把原函数封进 handler 闭包，不再透传函数属性；
drf-spectacular 0.30 依赖"装饰 as_view 产物 → 写入 cls.kwargs['schema']"
这条通道注入扩展 schema。放在下方会静默丢失（schema 里没有该端点）。
"""

import logging

from django.contrib.auth import (
    authenticate,
    get_user_model,
    login,
    logout,
    update_session_auth_hash,
)
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.users import services
from apps.users.serializers import (
    BindSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)

_TOO_MANY_ATTEMPTS = {"detail": "尝试次数过多，请 15 分钟后再试。"}
_INVALID_CREDENTIALS = {"detail": "用户名或密码错误。"}
# 本地单机版：昵称即身份。这两个 code 供前端区分"补二级验证"与"可直接新建"。
_PASSWORD_REQUIRED = {"detail": "该账户已设置密码，请输入密码。", "code": "password_required"}
_NOT_FOUND = {"detail": "没有这个昵称，可直接新建。", "code": "not_found"}
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
    summary="登录 / 昵称直入",
    request=LoginSerializer,
    responses={200: UserSerializer},
    auth=[],
)
@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """会话登录。本地单机版语义：

    - 免密账户（未绑定密码）：仅凭昵称直接登录，无需二级验证；
    - 已绑定密码的账户：昵称 + 密码校验，失败按用户名做防暴力锁定，且不区分
      "用户不存在 / 密码错误"（防探测）；
    - 只给昵称时：账户有密码 → 401 `password_required`（前端补密码框）；
      账户不存在 → 404 `not_found`（前端提示可新建）。
    """
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    username = serializer.validated_data["username"]
    password = serializer.validated_data.get("password") or ""

    user = User.objects.filter(username=username).first()

    # (a) 免密账户：昵称即身份，直接登录
    if user is not None and not user.has_usable_password():
        login(request, user)
        return Response(UserSerializer(user).data)

    # 未给密码：区分"要密码"与"不存在"，供前端决定下一步
    if not password:
        if user is not None:
            return Response(_PASSWORD_REQUIRED, status=status.HTTP_401_UNAUTHORIZED)
        return Response(_NOT_FOUND, status=status.HTTP_404_NOT_FOUND)

    # (b) 有密码账户：防暴力 + authenticate
    if services.is_locked(username):
        logger.warning("login locked: username=%s ip=%s", username, request.META.get("REMOTE_ADDR"))
        return Response(_TOO_MANY_ATTEMPTS, status=status.HTTP_429_TOO_MANY_REQUESTS)

    authed = authenticate(request, username=username, password=password)
    if authed is None:
        services.record_failure(username)
        logger.warning("login failed: username=%s ip=%s", username, request.META.get("REMOTE_ADDR"))
        return Response(_INVALID_CREDENTIALS, status=status.HTTP_400_BAD_REQUEST)

    services.reset(username)
    login(request, authed)
    return Response(UserSerializer(authed).data)


@extend_schema(
    summary="绑定 / 修改密码或邮箱（仅本人）",
    request=BindSerializer,
    responses={200: UserSerializer},
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bind(request):
    """设置页自助：加/改密码、绑定/换邮箱、或移除密码回到免密直入。

    改密后 `update_session_auth_hash` 保住当前会话（否则 set_password 会踢掉自己）。
    """
    serializer = BindSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = request.user
    password = serializer.validated_data.get("password")
    email = serializer.validated_data.get("email")
    remove_password = serializer.validated_data.get("remove_password")

    if remove_password:
        user.set_unusable_password()
    elif password:
        user.set_password(password)

    if email is not None:
        email = email or None
        if email and User.objects.filter(email=email).exclude(pk=user.pk).exists():
            raise ValidationError({"email": ["该邮箱已被其他账户使用。"]})
        user.email = email

    user.save()
    if password:
        update_session_auth_hash(request, user)
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
