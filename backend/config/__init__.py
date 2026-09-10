"""Django 项目包的启动钩子：导入 Celery 应用。

必须在包初始化时导入，Django 加载 settings 之前 Celery 就已就绪，
`@shared_task` 才能在 worker 里正确绑定（Sprint 6）。
"""

from config.celery import app as celery_app

__all__ = ["celery_app"]
