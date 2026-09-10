"""
Mini Plane 后端基础配置（所有环境共享）。

- 环境差异放 local.py（本地开发）/ test.py（自动化测试）；
- 敏感值一律走环境变量，样例见 backend/.env.example；
- BASE_DIR 指向 backend/ 目录（本文件位于 config/settings/ 下）。
"""

from pathlib import Path

import environ

# BASE_DIR = backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, []),
    CORS_ALLOWED_ORIGINS=(list, []),
    CSRF_TRUSTED_ORIGINS=(list, []),
)
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")

DEBUG = env("DEBUG")

ALLOWED_HOSTS = env("ALLOWED_HOSTS")

# Application definition

INSTALLED_APPS = [
    # daphne 必须放最上面：它接管 runserver，让本地开发直接跑 ASGI（Sprint 7）
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # 第三方
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
    "channels",
    # 本项目基础设施（views/permissions/pagination/filtering/cache；无 models）
    # Sprint 6 加入：manage.py 命令只从 INSTALLED_APPS 里发现，不登记就拿不到 check_cache
    "core",
    # 业务（Mini Plane）
    "apps.users",
    "apps.workspaces",
    "apps.projects",
    "apps.issues",
    "apps.activity",
    "apps.jobs",
    "apps.realtime",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # CORS 要尽量靠前：必须在任何可能生成响应的中间件之前
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
# Sprint 7：ASGI 才能同时服务 HTTP 与 WebSocket（runserver 由 daphne 接管）
ASGI_APPLICATION = "config.asgi.application"

# Database
# 通过 DATABASE_URL 注入，如 postgres://user:password@127.0.0.1:5432/miniplane

DATABASES = {
    "default": env.db_url("DATABASE_URL"),
}

# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# 自定义用户模型（Sprint 1 起；UUID 主键见 apps/users/models.py）
AUTH_USER_MODEL = "users.User"

# Internationalization
# 时区策略（BACKEND_PLAN 决策 D8）：数据库统一存 UTC（USE_TZ=True），展示层用上海时区。

LANGUAGE_CODE = "zh-hans"

TIME_ZONE = "Asia/Shanghai"

USE_I18N = True

USE_TZ = True

# Static files

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Django REST Framework

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    # 默认拒绝：匿名接口（health/csrf/register/login）在各视图中显式声明 AllowAny
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "core.pagination.StandardPagination",
    "EXCEPTION_HANDLER": "core.exceptions.custom_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# CORS / CSRF：前后端跨端口联调用；同源部署时保持配置也无害
CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS")

# ── 缓存（Sprint 6）────────────────────────────────────────────
# CACHE_URL 不配 → LocMem（单进程内存缓存，重启即清空，够本地开发用）
# CACHE_URL=redis://127.0.0.1:6379/0 → django-redis（本地需要 Redis，见 docker-compose.yml）
# 注意 django-environ 的 scheme 是 locmemcache（不是 locmem）
CACHES = {"default": env.cache_url("CACHE_URL", default="locmemcache://")}
if "RedisCache" in CACHES["default"]["BACKEND"]:
    # 显式用 JSON 序列化：缓存里存的必须和 HTTP 响应体长得一样（见 07 契约的一致性保证），
    # 用 pickle 会把 Python 对象（UUID/datetime）原样吞进去，排查时不可读。
    CACHES["default"].setdefault("OPTIONS", {}).update(
        {"SERIALIZER": "django_redis.serializers.json.JSONSerializer"}
    )

# ── 异步任务（Sprint 6）────────────────────────────────────────
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://127.0.0.1:6379/1")
CELERY_RESULT_BACKEND = env(
    "CELERY_RESULT_BACKEND",
    default="cache+memory://" if CELERY_BROKER_URL.startswith("filesystem://") else None,
)
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
# eager 模式下把任务异常原样抛出：否则测试里"任务失败"会被静默吞掉
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TIME_LIMIT = 300
# 长任务先确认再 ack（worker 崩溃时任务不丢），配合 prefetch=1 避免单 worker 囤积
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1

if CELERY_BROKER_URL.startswith("filesystem://"):
    # 无 Docker 的本地通道：filesystem broker 可跨进程（producer 与 worker 各一个进程），
    # 不像 memory:// 只在自己进程内有效。
    # 注意 data_folder_in 和 data_folder_out 必须是**同一个目录**（生产者写、消费者读同一处）。
    # store_processed 必须关掉：它靠 os.rename 把消息挪进 processed 目录，Windows 上会
    # 因文件被占用而失败（实测 ChannelError: Cannot read file ... from queue）。
    # 用法见 docs/devlog/sprint-6-backend.md。
    _celery_data_dir = BASE_DIR / ".celery"
    _celery_data_dir.mkdir(parents=True, exist_ok=True)
    CELERY_BROKER_TRANSPORT_OPTIONS = {
        "data_folder_in": str(_celery_data_dir),
        "data_folder_out": str(_celery_data_dir),
        "store_processed": False,
        "processing_interval": 1,
    }

# ── 实时推送（Sprint 7）────────────────────────────────────────
# 不配 CHANNEL_REDIS_URL → InMemory（单进程，本地开发与测试够用，重启即清空）
# 配了 → Redis channel layer（多进程/多实例广播时必须用这个，见 docker-compose.yml 的 redis）
CHANNEL_REDIS_URL = env("CHANNEL_REDIS_URL", default="")
if CHANNEL_REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [CHANNEL_REDIS_URL]},
        }
    }
else:
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}

# API 文档（drf-spectacular）：/api/schema/ 与 /api/docs/

SPECTACULAR_SETTINGS = {
    "TITLE": "Mini Plane API",
    "DESCRIPTION": "仿 Plane 的迷你项目管理软件（学习项目）REST API。",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}
