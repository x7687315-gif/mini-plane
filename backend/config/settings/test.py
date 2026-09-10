"""自动化测试配置：python manage.py test --settings=config.settings.test"""

from .base import *  # noqa: F403

DEBUG = False

# 测试提速：MD5 哈希只允许出现在测试配置里，生产严禁
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# ── Sprint 6：测试不依赖任何外部服务 ─────────────────────────
# 显式覆盖，避免开发机 .env 里配了 CACHE_URL=redis:// 导致测试连不上 Redis 而失败。
# 缓存用进程内内存：缓存逻辑（键规范 / 两种失效策略 / TTL / 序列化一致性）都能完整验证。
# Redis 后端专有的行为（delete_pattern）只在 `manage.py check_cache` 里手工验证。
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "mini-plane-test",
    }
}

# 任务同步执行：不需要 broker / worker
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# WebSocket 的 channel layer 用进程内实现：测试不依赖 Redis
# （消费者鉴权、组广播、事件包体都能完整验证；跨进程广播只有真 Redis 才能测）
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
