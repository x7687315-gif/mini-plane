"""登录防暴力：进程内存版失败计数（BACKEND_PLAN Sprint 1 约定）。

正式的分布式限流放二期（配合 Redis + DRF throttling）；本模块只求
"有真实保护 + 逻辑一目了然"。键为用户名（不区分大小写），
15 分钟滑动窗口内累计 5 次失败即锁定；成功登录立即清零。

**内存必须有界**：计数器按用户名建键且永不主动过期，攻击者用随机用户名
刷登录接口就能让 `_FAILURES` 无限膨胀（这是进程级字典，不是 Redis）。
因此每次写入前顺手清理过期键，并给 tracked 键总数设硬上限——
超限时按最旧插入序驱逐（dict 保持插入序）。
"""

import threading
import time

_LOCK = threading.Lock()
_FAILURES: dict[str, list[float]] = {}

WINDOW_SECONDS = 15 * 60
MAX_FAILURES = 5
#: tracked 用户名的硬上限；正常部署远达不到（ 达到即说明在被刷，驱逐最旧的即可 ）
MAX_TRACKED_USERNAMES = 10_000


def _normalize(username: str) -> str:
    return username.strip().lower()


def _prune_locked(now: float) -> None:
    """清理过期键 + 驱逐超限键。调用方必须已持有 _LOCK。"""
    expired = [
        key
        for key, timestamps in _FAILURES.items()
        if all(now - t >= WINDOW_SECONDS for t in timestamps)
    ]
    for key in expired:
        del _FAILURES[key]
    while len(_FAILURES) > MAX_TRACKED_USERNAMES:
        _FAILURES.pop(next(iter(_FAILURES)))


def is_locked(username: str) -> bool:
    """该用户名是否处于锁定窗口内。"""
    key = _normalize(username)
    now = time.monotonic()
    with _LOCK:
        recent = [t for t in _FAILURES.get(key, []) if now - t < WINDOW_SECONDS]
        _FAILURES[key] = recent
        return len(recent) >= MAX_FAILURES


def record_failure(username: str) -> None:
    """记录一次登录失败。先写入再清理：保证写入后总数也不超上限。"""
    key = _normalize(username)
    now = time.monotonic()
    with _LOCK:
        _FAILURES.setdefault(key, []).append(now)
        _prune_locked(now)


def reset(username: str) -> None:
    """登录成功后清零计数。"""
    with _LOCK:
        _FAILURES.pop(_normalize(username), None)


def clear_all() -> None:
    """清空全部计数 —— 仅供测试隔离使用（计数器是进程级状态）。"""
    with _LOCK:
        _FAILURES.clear()
