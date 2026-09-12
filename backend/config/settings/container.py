"""容器编排配置（Sprint 8）：docker compose 里的 web / asgi / worker / init 共用。

与 local.py 的核心差别——容器是一个"没有你开发机便利"的环境：

- DEBUG=False；ALLOWED_HOSTS 全量 env 驱动（compose 传入）；
- 缓存 / Celery / channel layer 的默认值直接指向 compose 网络的服务名 `redis`
  （与 docker-compose.yml 的端口约定一致：0=缓存 1=broker 2=result 3=channel layer），
  任务真异步（EAGER=False，由 worker 消费）；
- 静态文件：whitenoise 从 collectstatic 产物服务（init 服务先 collectstatic）。

本地想验证本文件（Windows 上 gunicorn 跑不起来是正常的，它只在容器里跑）：

    pip install -r requirements/prod.txt
    SECRET_KEY=dev-only DATABASE_URL=postgres://... CACHE_URL=locmemcache:// \
      python manage.py check --settings=config.settings.container

所有值仍然可以被环境变量覆盖（env() 先读环境变量、再落默认值）。
"""

from .base import *  # noqa: F403

DEBUG = False

# 容器内健康检查走 127.0.0.1，显式兜底，避免 compose 漏传 ALLOWED_HOSTS 时全站 400
ALLOWED_HOSTS += ["localhost", "127.0.0.1"]  # noqa: F405

# ── 静态文件（whitenoise）────────────────────────────────────
# 位置必须在 SecurityMiddleware 之后、一切可能生成响应的中间件之前（与 CORS 同理）
STATIC_ROOT = BASE_DIR / "staticfiles"  # noqa: F405
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405

# ── 缓存：默认 compose 网络里的 redis，0 号库 ─────────────────
CACHES = {"default": env.cache_url("CACHE_URL", default="redis://redis:6379/0")}  # noqa: F405
if "RedisCache" in CACHES["default"]["BACKEND"]:
    # 与 base.py 同一规则：缓存体必须 JSON-safe，与 HTTP 响应一致（07 契约）
    CACHES["default"].setdefault("OPTIONS", {}).update(
        {"SERIALIZER": "django_redis.serializers.json.JSONSerializer"}
    )

# ── Celery：默认 redis，1/2 号库，任务真异步 ─────────────────
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://redis:6379/1")  # noqa: F405
CELERY_RESULT_BACKEND = env(  # noqa: F405
    "CELERY_RESULT_BACKEND", default="redis://redis:6379/2"
)
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)  # noqa: F405

# ── 实时推送：默认 redis channel layer，3 号库（多进程广播的前提）──
CHANNEL_REDIS_URL = env("CHANNEL_REDIS_URL", default="redis://redis:6379/3")  # noqa: F405
if CHANNEL_REDIS_URL:
    CHANNEL_LAYERS = {  # noqa: F405
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [CHANNEL_REDIS_URL]},
        }
    }
else:
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}  # noqa: F405
