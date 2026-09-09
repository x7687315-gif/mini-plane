"""登录防暴力：进程内存版失败计数（BACKEND_PLAN Sprint 1 约定）。

正式的分布式限流放二期（配合 Redis + DRF throttling）；本模块只求
"有真实保护 + 逻辑一目了然"。键为用户名（不区分大小写），
15 分钟滑动窗口内累计 5 次失败即锁定；成功登录立即清零。
"""

import threading
import time

_LOCK = threading.Lock()
_FAILURES: dict[str, list[float]] = {}

WINDOW_SECONDS = 15 * 60
MAX_FAILURES = 5


def _normalize(username: str) -> str:
    return username.strip().lower()


def is_locked(username: str) -> bool:
    """该用户名是否处于锁定窗口内。"""
    key = _normalize(username)
    now = time.monotonic()
    with _LOCK:
        recent = [t for t in _FAILURES.get(key, []) if now - t < WINDOW_SECONDS]
        _FAILURES[key] = recent
        return len(recent) >= MAX_FAILURES


def record_failure(username: str) -> None:
    """记录一次登录失败。"""
    key = _normalize(username)
    with _LOCK:
        _FAILURES.setdefault(key, []).append(time.monotonic())


def reset(username: str) -> None:
    """登录成功后清零计数。"""
    with _LOCK:
        _FAILURES.pop(_normalize(username), None)


def clear_all() -> None:
    """清空全部计数 —— 仅供测试隔离使用（计数器是进程级状态）。"""
    with _LOCK:
        _FAILURES.clear()
