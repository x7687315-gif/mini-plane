"""会话 / Cookie 安全属性的回归测试（hardening，hardening devlog §F3）。

这些值是全局安全默认值：显式断言防止未来重构悄悄改回浏览器默认
（SameSite 不写 = 交给浏览器，跨站 WebSocket 握手的行为就不可控了）。
"""

from django.conf import settings
from django.test import TestCase


class SessionCookieSecurityTests(TestCase):
    def test_samesite_is_explicitly_lax(self):
        """会话与 CSRF cookie 显式 Lax：跨站请求（含 WS 握手）不携带凭证。"""
        self.assertEqual(settings.SESSION_COOKIE_SAMESITE, "Lax")
        self.assertEqual(settings.CSRF_COOKIE_SAMESITE, "Lax")

    def test_session_cookie_is_httponly(self):
        """会话 cookie 禁止 JS 读取（Django 默认值，钉死它）。"""
        self.assertTrue(settings.SESSION_COOKIE_HTTPONLY)

    def test_secure_flags_default_off_and_env_driven(self):
        """本地与 compose 都是 http，Secure 必须默认关闭、由 env 打开。"""
        self.assertFalse(settings.SESSION_COOKIE_SECURE)
        self.assertFalse(settings.CSRF_COOKIE_SECURE)
