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
        self.assertEqual(response.json(), {"status": "ok", "database": "ok", "cache": "ok"})

    def test_health_reports_cache_error(self):
        """缓存后端不可用 → cache=error 且整体 503，但不抛 500。"""
        with mock.patch.object(cache, "set", side_effect=ConnectionError("cache down")):
            response = self.client.get("/api/v1/health/")

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.json(), {"status": "error", "database": "ok", "cache": "error"})

    def test_health_returns_503_when_database_unreachable(self):
        """数据库探测失败时返回 503 与 error 状态，不抛 500。"""
        with mock.patch("core.views.connections") as mock_connections:
            mock_connections["default"].cursor.side_effect = DatabaseError("db down")
            response = self.client.get("/api/v1/health/")

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.json(), {"status": "error", "database": "error", "cache": "ok"})
