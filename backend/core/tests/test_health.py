"""Sprint 0 建立雏形 / Sprint 6 加入缓存探测：health 接口验收测试。"""

from unittest import mock

from django.core.cache import cache
from django.db import DatabaseError
from rest_framework import status
from rest_framework.test import APITestCase


class HealthCheckTests(APITestCase):
    def test_health_ok(self):
        """数据库与缓存可达时返回 200 与 ok 状态。"""
        response = self.client.get("/api/v1/health/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        # 逐字段断言而不是整字典相等：health 后续新增字段（如 app/engine）不该让这些用例红。
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["database"], "ok")
        self.assertEqual(body["cache"], "ok")
        # 身份标识：桌面启动器靠它判断"端口上这个后端是不是我要的那个"（2026-10-03）
        self.assertEqual(body["app"], "mini-plane")
        self.assertTrue(body["engine"], "engine 应报告数据库后端类型")

    def test_health_reports_cache_error(self):
        """缓存后端不可用 → cache=error 且整体 503，但不抛 500。"""
        with mock.patch.object(cache, "set", side_effect=ConnectionError("cache down")):
            response = self.client.get("/api/v1/health/")

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        body = response.json()
        self.assertEqual(body["status"], "error")
        self.assertEqual(body["database"], "ok")
        self.assertEqual(body["cache"], "error")

    def test_health_returns_503_when_database_unreachable(self):
        """数据库探测失败时返回 503 与 error 状态，不抛 500。"""
        with mock.patch("core.views.connections") as mock_connections:
            mock_connections["default"].cursor.side_effect = DatabaseError("db down")
            response = self.client.get("/api/v1/health/")

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        body = response.json()
        self.assertEqual(body["status"], "error")
        self.assertEqual(body["database"], "error")
        self.assertEqual(body["cache"], "ok")
