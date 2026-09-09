"""本地开发配置（manage.py 默认使用本文件）。"""

from .base import *  # noqa: F403

DEBUG = True

ALLOWED_HOSTS += ["localhost", "127.0.0.1"]  # noqa: F405
