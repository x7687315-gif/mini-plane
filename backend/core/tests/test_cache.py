"""缓存原语测试（core/cache.py）：键规范 / 两种失效策略 / JSON-safe / 版本自增。"""

import uuid
from datetime import UTC, datetime

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from core import cache as cache_primitives


class CacheKeyTests(SimpleTestCase):
    def test_key_shape_with_scope_and_version(self):
        self.assertEqual(
            cache_primitives.make_key("project", scope="ws-slug:pid"),
            "mini:project:ws-slug:pid",
        )
        self.assertEqual(
            cache_primitives.make_key("project", scope="ws-slug:pid", version=3),
            "mini:project:ws-slug:pid:v3",
        )

    def test_key_without_scope(self):
        self.assertEqual(cache_primitives.make_key("health"), "mini:health")

    def test_version_key_has_no_version_suffix(self):
        """版本键本身不能带 v 后缀，否则自增就无从谈起。"""
        self.assertEqual(cache_primitives.version_key("project", scope="a:b"), "mini:project:a:b")

    def test_versioned_key_uses_current_version(self):
        self.assertEqual(
            cache_primitives.versioned_key("project", scope="a:b"),
            f"mini:project:a:b:v{cache_primitives.get_version('project', scope='a:b')}",
        )


class InvalidateStrategyTests(TestCase):
    """两种失效策略的行为差异（07 契约要求对比）。"""

    def setUp(self):
        cache.clear()

    def test_version_strategy_orphans_old_key(self):
        entity, scope = "bench", uuid.uuid4().hex
        v0 = cache_primitives.get_version(entity, scope=scope)
        key0 = cache_primitives.make_key(entity, scope=scope, version=v0)
        cache.set(key0, {"n": 1}, 60)

        cache_primitives.invalidate(entity, scope=scope, strategy=cache_primitives.STRATEGY_VERSION)

        self.assertEqual(cache_primitives.get_version(entity, scope=scope), v0 + 1)
        # 旧键还在（孤儿，靠 TTL 回收），但新版本下读不到 —— 这就是"作废"的实现方式
        self.assertEqual(cache.get(key0), {"n": 1})
        self.assertIsNone(cache.get(cache_primitives.make_key(entity, scope=scope, version=v0 + 1)))

    def test_delete_strategy_removes_current_key(self):
        entity, scope = "bench", uuid.uuid4().hex
        key = cache_primitives.versioned_key(entity, scope=scope)
        cache.set(key, {"n": 1}, 60)

        cache_primitives.invalidate(entity, scope=scope, strategy=cache_primitives.STRATEGY_DELETE)

        self.assertIsNone(cache.get(key))

    def test_unknown_strategy_fails_loudly(self):
        with self.assertRaises(ValueError):
            cache_primitives.invalidate("bench", scope="x", strategy="whatever")

    def test_bump_version_starts_from_one(self):
        entity, scope = "bench", uuid.uuid4().hex
        self.assertEqual(cache_primitives.get_version(entity, scope=scope), 0)
        self.assertEqual(cache_primitives.bump_version(entity, scope=scope), 1)
        self.assertEqual(cache_primitives.bump_version(entity, scope=scope), 2)


class GetOrSetVersionedTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_loader_called_once_then_served_from_cache(self):
        entity, scope = "bench", uuid.uuid4().hex
        calls = []

        def loader():
            calls.append(1)
            return {"value": len(calls)}

        first, first_hit = cache_primitives.get_or_set_versioned(entity, scope=scope, loader=loader)
        self.assertEqual((first, first_hit), ({"value": 1}, False))

        second, second_hit = cache_primitives.get_or_set_versioned(
            entity, scope=scope, loader=loader
        )
        self.assertEqual((second, second_hit), ({"value": 1}, True))
        self.assertEqual(len(calls), 1)  # 第二次没再查库

    def test_invalidation_triggers_reload(self):
        entity, scope = "bench", uuid.uuid4().hex
        counter = {"n": 0}

        def loader():
            counter["n"] += 1
            return {"round": counter["n"]}

        cache_primitives.get_or_set_versioned(entity, scope=scope, loader=loader)
        cache_primitives.invalidate(entity, scope=scope)
        payload, hit = cache_primitives.get_or_set_versioned(entity, scope=scope, loader=loader)

        self.assertFalse(hit)
        self.assertEqual(payload, {"round": 2})


class JsonSafeTests(SimpleTestCase):
    def test_normalizes_uuid_and_datetime(self):
        some_id = uuid.uuid4()
        payload = {"id": some_id, "created_at": timezone.now()}
        safe = cache_primitives.json_safe(payload)

        self.assertEqual(safe["id"], str(some_id))
        self.assertIsInstance(safe["created_at"], str)

    def test_aware_datetime_matches_drf_encoder_output(self):
        """与 DRF JSONRenderer 的编码结果一致 —— 这是"缓存读 == 直读"的前提。"""
        moment = datetime(2026, 9, 10, 12, 30, 0, tzinfo=UTC)
        self.assertEqual(cache_primitives.json_safe({"ts": moment})["ts"], "2026-09-10T12:30:00Z")
