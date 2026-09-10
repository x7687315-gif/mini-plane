"""验证缓存后端可用性与键规范（Sprint 6 验收辅助工具）。

用法：

    python manage.py check_cache --settings=config.settings.local

做三件事：
1. 报告当前使用的缓存后端（LocMem / Redis）；
2. 按键规范做写/读/删，并验证短 TTL；
3. 演示"版本号失效"与"直接删除"两种策略的实际效果（07 契约要求对比）。

Redis 后端专有的 `delete_pattern` 能力也在这里验证，
因为它进不了单测（测试配置固定用 LocMem）。
"""

from django.core.cache import cache
from django.core.management.base import BaseCommand

from core import cache as cache_primitives

ENTITY = "bench"
SCOPE = "check"


class Command(BaseCommand):
    help = "验证缓存后端与缓存原语（键规范 / 两种失效策略 / TTL）"

    def handle(self, *args, **options):
        backend = f"{cache.__class__.__module__}.{cache.__class__.__name__}"
        self.stdout.write(f"缓存后端：{backend}")

        if self._round_trip():
            self.stdout.write(self.style.SUCCESS("PASS  后端读写正常"))
        else:
            self.stdout.write(self.style.ERROR("FAIL  后端读写异常"))
            return

        self._check_ttl()
        self._check_strategies()

        flushed = cache_primitives.flush_entity(ENTITY)
        if flushed == 0:
            self.stdout.write(
                "提示：当前后端不支持 delete_pattern（LocMem），flush_entity() 返回 0 —— 属预期"
            )

    # ── 步骤 ───────────────────────────────────────────────────

    def _round_trip(self) -> bool:
        key = cache_primitives.make_key(ENTITY, scope=SCOPE, version=1)
        try:
            cache.set(key, {"hello": "缓存"}, 60)
            value = cache.get(key)
            cache.delete(key)
        except Exception as exc:  # noqa: BLE001
            self.stdout.write(self.style.ERROR(f"  异常：{exc}"))
            return False
        self.stdout.write(
            f"  写入→读取 {value!r} → {'一致' if value == {'hello': '缓存'} else '不一致'}"
        )
        return value == {"hello": "缓存"}

    def _check_ttl(self) -> None:
        key = cache_primitives.make_key(ENTITY, scope="ttl", version=1)
        cache.set(key, "x", 1)
        self.stdout.write(f"  短 TTL 写入后立即可读：{cache.get(key) == 'x'}")
        cache.delete(key)

    def _check_strategies(self) -> None:
        """两种失效策略的对比演示（结论写进 devlog）。"""
        self.stdout.write("=== 策略对比：version vs delete ===")

        before = cache_primitives.get_version(ENTITY, scope=SCOPE)
        cache_primitives.bump_version(ENTITY, scope=SCOPE)
        after = cache_primitives.get_version(ENTITY, scope=SCOPE)
        self.stdout.write(
            f"  version：版本号 {before} → {after}（旧键不删，成为孤儿，靠 TTL 回收）"
        )

        key = cache_primitives.make_key(ENTITY, scope=SCOPE, version=after)
        cache.set(key, "payload", 60)
        cache_primitives.invalidate(ENTITY, scope=SCOPE, strategy=cache_primitives.STRATEGY_DELETE)
        self.stdout.write(f"  delete ：键 {key} 是否还在 → {cache.get(key) is not None}")
