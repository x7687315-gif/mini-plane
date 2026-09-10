"""本地开发配置（manage.py 默认使用本文件）。"""

from .base import *  # noqa: F403

DEBUG = True

ALLOWED_HOSTS += ["localhost", "127.0.0.1"]  # noqa: F405

# ── Sprint 6：本地默认"零外部依赖"────────────────────────────
# 任务同步执行：机器上没装 Redis/Docker 也能把评论通知、批量操作整条链路跑通。
# 想验证"真 worker 消费任务"时，二选一（见 docs/devlog/sprint-6-backend.md）：
#   A. 起 Redis： docker compose up -d redis
#      .env 里设 CELERY_TASK_ALWAYS_EAGER=False、CELERY_BROKER_URL=redis://127.0.0.1:6379/1
#      再开一个终端： python -m celery -A config worker -l info
#   B. 无 Docker： .env 里设 CELERY_TASK_ALWAYS_EAGER=False
#      CELERY_BROKER_URL=filesystem://
#      再开一个终端： python -m celery -A config worker -l info
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=True)  # noqa: F405
