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
    # 业务（Mini Plane）
    "apps.users",
    "apps.workspaces",
    "apps.projects",
    "apps.issues",
    "apps.activity",
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

# API 文档（drf-spectacular）：/api/schema/ 与 /api/docs/

SPECTACULAR_SETTINGS = {
    "TITLE": "Mini Plane API",
    "DESCRIPTION": "仿 Plane 的迷你项目管理软件（学习项目）REST API。",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}
