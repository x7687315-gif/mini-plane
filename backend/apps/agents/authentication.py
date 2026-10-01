"""Agent Token 认证（Sprint 12，§24）。

只认 `Authorization: Bearer mpa_<...>`；命中即把 request.user 设为 Token 持有人、
request.auth 设为 AgentToken（权限白名单挂在它上面）。
非 Bearer/mpa_ 前缀返回 None（交给其他认证类或判 401）。
"""

from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework import authentication
from rest_framework.exceptions import AuthenticationFailed

from apps.agents.models import TOKEN_PREFIX, AgentToken, hash_token


class AgentTokenAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        parts = header.split(" ", 1)
        if len(parts) != 2 or parts[0] != self.keyword:
            return None
        raw = parts[1].strip()
        if not raw.startswith(TOKEN_PREFIX):
            return None

        token = (
            AgentToken.objects.filter(token_hash=hash_token(raw)).select_related("owner").first()
        )
        if token is None or not token.is_active:
            raise AuthenticationFailed("Agent Token 无效或已吊销。")
        token.touch()
        return (token.owner, token)

    def authenticate_header(self, request):
        return self.keyword


class AgentTokenAuthExtension(OpenApiAuthenticationExtension):
    """让 drf-spectacular 把 Agent Token 描述成 Bearer 安全方案（否则 schema 生成告警）。"""

    target_class = "apps.agents.authentication.AgentTokenAuthentication"
    name = "agentTokenAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "description": "Agent Token（mpa_ 前缀），权限受 scopes 白名单限制。",
        }
