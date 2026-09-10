"""缓存原语（契约 docs/api/07-cache-and-tasks.md）。

只做三件事，业务语义留给各 app：

1. **键命名规范** `mini:{entity}:{scope}:v{version}` —— 前缀固定，便于在 Redis 里
   一眼看出哪些键是本项目的、以及清理时不会误删别人的数据；
2. **两种失效策略都实现**（计划 §Sprint 6 要求对比后写结论）：
   - `version`：自增一个不带头 TTL 的版本号键，旧键瞬间"失效"（成为孤儿，靠 TTL 回收）
   - `delete`：直接删除具体键
3. **值一律 JSON-safe**：写缓存前用 DRF 的 JSONEncoder 归一化，
   保证"缓存读到的"与"直接查库序列化出来的"字节一致（计划 §Sprint 6 测试清单）。

设计取舍：本项目缓存的是**响应体片段**而不是 ORM 对象。
缓存 ORM 对象会绕过权限与业务规则（"缓存返回了一个本该 404 的项目"这类事故），
而缓存响应体片段时，鉴权仍然实时执行。
"""

import json

from django.core.cache import cache
from rest_framework.utils.encoders import JSONEncoder

PREFIX = "mini"
DEFAULT_TTL = 300  # 计划 §Sprint 6：TTL 300s 兜底

STRATEGY_VERSION = "version"
STRATEGY_DELETE = "delete"
STRATEGIES = (STRATEGY_VERSION, STRATEGY_DELETE)


def make_key(entity: str, *, scope: str = "", version: int | None = None) -> str:
    """拼键：`mini:{entity}[:{scope}][:v{version}]`。"""
    parts = [PREFIX, entity]
    if scope:
        parts.append(str(scope))
    if version is not None:
        parts.append(f"v{version}")
    return ":".join(parts)


def version_key(entity: str, *, scope: str = "") -> str:
    """版本号键本身**不带版本后缀**，否则自增就无从谈起。"""
    return make_key(entity, scope=scope, version=None)


def versioned_key(entity: str, *, scope: str = "") -> str:
    """当前版本下的数据键（读/写缓存都用它）。"""
    return make_key(entity, scope=scope, version=get_version(entity, scope=scope))


def json_safe(payload):
    """把序列化结果归一化成 JSON 原生结构（UUID→str、datetime→ISO8601）。"""
    return json.loads(json.dumps(payload, cls=JSONEncoder))


def get_version(entity: str, *, scope: str = "") -> int:
    return int(cache.get(version_key(entity, scope=scope), 0) or 0)


def bump_version(entity: str, *, scope: str = "") -> int:
    """版本号 +1，返回新版本。

    先走原子的 `incr`（Redis 上是 INCR），键不存在或后端不支持时退回 get/set。
    版本键**不设 TTL**：它必须比所有受它管辖的数据键活得久。
    """
    key = version_key(entity, scope=scope)
    try:
        return int(cache.incr(key))
    except ValueError:
        # 键不存在（多数后端 incr 会抛 ValueError）
        current = get_version(entity, scope=scope)
        cache.set(key, current + 1, None)
        return current + 1


def get_or_set_versioned(entity: str, *, scope: str, loader, ttl: int = DEFAULT_TTL):
    """Cache-Aside 读：命中直接返回，未命中调用 `loader()` 并回填。"""
    key = make_key(entity, scope=scope, version=get_version(entity, scope=scope))
    cached = cache.get(key)
    if cached is not None:
        return cached, True
    payload = json_safe(loader())
    cache.set(key, payload, ttl)
    return payload, False


def invalidate(entity: str, *, scope: str, strategy: str = STRATEGY_VERSION) -> None:
    """按指定策略失效。非法策略名直接报错，避免静默用了错的策略。"""
    if strategy not in STRATEGIES:
        raise ValueError(f"未知的缓存失效策略：{strategy}（可选 {STRATEGIES}）")
    if strategy == STRATEGY_VERSION:
        bump_version(entity, scope=scope)
    else:
        cache.delete(make_key(entity, scope=scope, version=get_version(entity, scope=scope)))


def flush_entity(entity: str) -> int:
    """清理某实体的全部键（含版本键）。

    仅在 Redis 后端下可用（`django-redis` 提供 `delete_pattern`）；
    其它后端返回 0 —— 本地 LocMem 后端重启即清空，不需要这个能力。
    """
    pattern = f"{PREFIX}:{entity}:*"
    delete_pattern = getattr(cache, "delete_pattern", None)
    if delete_pattern is None:
        return 0
    return delete_pattern(pattern)
