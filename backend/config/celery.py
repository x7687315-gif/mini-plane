"""Celery 应用入口（Sprint 6）。

`config/__init__.py` 会导入这里的 `app`，保证 Django 启动时 Celery 已完成初始化
（`@shared_task` 才能正确绑定到本 app；否则 worker 里任务会挂到默认 app 上）。
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

app = Celery("mini_plane")

# 所有 CELERY_* 配置都从 Django settings 读，不在这边散写
app.config_from_object("django.conf:settings", namespace="CELERY")

# 扫描各 app 的 tasks.py
app.autodiscover_tasks()
