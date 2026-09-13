"""Sprint 1 验收测试：Auth 全链路（契约 docs/api/01-auth.md）。"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.users import services

User = get_user_model()

REGISTER_URL = "/api/v1/auth/register/"
LOGIN_URL = "/api/v1/auth/login/"
LOGOUT_URL = "/api/v1/auth/logout/"
ME_URL = "/api/v1/auth/me/"
CSRF_URL = "/api/v1/auth/csrf/"

PAYLOAD = {"username": "amiya", "email": "amiya@example.com", "password": "S7rong-Pass!2026"}


class RegisterTests(APITestCase):
    def test_register_success_and_auto_login(self):
        response = self.client.post(REGISTER_URL, PAYLOAD, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        body = response.json()
        self.assertEqual(body["username"], "amiya")
        self.assertEqual(body["email"], "amiya@example.com")
        self.assertIsNone(body["avatar"])
        self.assertIn("created_at", body)
        self.assertEqual(len(body["id"]), 36)  # UUID 主键
        self.assertIn("sessionid", response.cookies)  # 注册即登录

    def test_register_duplicate_username(self):
        self.client.post(REGISTER_URL, PAYLOAD, format="json")
        payload = {**PAYLOAD, "email": "other@example.com"}

        response = self.client.post(REGISTER_URL, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.json())

    def test_register_duplicate_email(self):
        self.client.post(REGISTER_URL, PAYLOAD, format="json")
        payload = {**PAYLOAD, "username": "other"}

        response = self.client.post(REGISTER_URL, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.json())

    def test_register_weak_password(self):
        for weak in ("12345678", "password", "password1"):
            payload = {**PAYLOAD, "password": weak}
            response = self.client.post(REGISTER_URL, payload, format="json")

            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, msg=weak)
            self.assertIn("password", response.json())

    def test_register_missing_fields(self):
        response = self.client.post(REGISTER_URL, {"username": "amiya"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        body = response.json()
        self.assertIn("email", body)
        self.assertIn("password", body)

    def test_register_password_is_hashed_and_never_in_response(self):
        response = self.client.post(REGISTER_URL, PAYLOAD, format="json")

        self.assertNotIn("password", response.json())
        user = User.objects.get(username="amiya")
        self.assertNotEqual(user.password, PAYLOAD["password"])  # 已哈希
        self.assertTrue(user.check_password(PAYLOAD["password"]))


class LoginTests(APITestCase):
    def setUp(self):
        # 失败计数是进程级状态，跨用例残留会误锁后续用例
        services.clear_all()
        self.client.post(REGISTER_URL, PAYLOAD, format="json")
        self.client.logout()

    def test_login_success(self):
        response = self.client.post(
            LOGIN_URL, {"username": "amiya", "password": PAYLOAD["password"]}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["username"], "amiya")
        self.assertIn("sessionid", response.cookies)

    def test_login_wrong_password(self):
        response = self.client.post(
            LOGIN_URL, {"username": "amiya", "password": "Wrong-Pass!x"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["detail"], "用户名或密码错误。")

    def test_login_unknown_user_returns_same_error(self):
        """不区分"用户不存在/密码错误"，防用户名探测（契约 §login）。"""
        response = self.client.post(
            LOGIN_URL, {"username": "ghost", "password": "Whatever-1"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["detail"], "用户名或密码错误。")

    def test_login_lockout_after_five_failures(self):
        for _ in range(5):
            self.client.post(
                LOGIN_URL, {"username": "amiya", "password": "bad-pass-1"}, format="json"
            )

        # 第 6 次：即使密码正确也拒绝
        response = self.client.post(
            LOGIN_URL, {"username": "amiya", "password": PAYLOAD["password"]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_login_rejects_oversized_credentials(self):
        """超长凭据在校验层拦下（与 User 模型对齐），不进密码哈希器。"""
        response = self.client.post(
            LOGIN_URL, {"username": "x" * 151, "password": "p" * 129}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.json())


class RateLimiterMemoryTests(TestCase):
    """限流计数器的内存有界性（hardening）：过期清理 + 容量上限。"""

    def setUp(self):
        services.clear_all()
        self.addCleanup(services.clear_all)

    def test_expired_entries_are_pruned_on_write(self):
        """窗口外的失败记录在下次写入时被清掉，不会永久滞留。"""
        import time as time_module

        stale = time_module.monotonic() - services.WINDOW_SECONDS - 1
        services._FAILURES["ghost-user"] = [stale, stale]

        services.record_failure("fresh-user")

        self.assertNotIn("ghost-user", services._FAILURES)
        self.assertIn("fresh-user", services._FAILURES)

    def test_tracked_usernames_are_capped(self):
        """键总数超过上限时按最旧插入序驱逐，内存有界。"""
        from unittest.mock import patch

        with patch.object(services, "MAX_TRACKED_USERNAMES", 3):
            for index in range(5):
                services.record_failure(f"user-{index}")

        self.assertEqual(len(services._FAILURES), 3)
        # 最旧的 user-0 / user-1 被驱逐
        self.assertNotIn("user-0", services._FAILURES)
        self.assertIn("user-4", services._FAILURES)


class MeLogoutTests(APITestCase):
    def setUp(self):
        self.client.post(REGISTER_URL, PAYLOAD, format="json")

    def test_me_authenticated(self):
        response = self.client.get(ME_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["username"], "amiya")

    def test_me_unauthenticated_returns_401(self):
        client = APIClient()  # 不携带任何凭证
        response = client.get(ME_URL)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_then_me_returns_401(self):
        response = self.client.post(LOGOUT_URL)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        self.assertEqual(self.client.get(ME_URL).status_code, status.HTTP_401_UNAUTHORIZED)


class CSRFFlowTests(APITestCase):
    """真实浏览器路径：enforce_csrf_checks=True 下，写操作必须携带 X-CSRFToken。"""

    def test_logout_requires_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        client.post(REGISTER_URL, PAYLOAD, format="json")

        # 未带 token → 403
        response = client.post(LOGOUT_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 取 cookie 后带 X-CSRFToken → 204
        client.get(CSRF_URL)
        token = client.cookies["csrftoken"].value
        response = client.post(LOGOUT_URL, HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        # 登出后 session 失效
        self.assertEqual(client.get(ME_URL).status_code, status.HTTP_401_UNAUTHORIZED)
