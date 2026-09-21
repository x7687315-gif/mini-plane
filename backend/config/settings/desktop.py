"""桌面单机版配置（本地软件专用，零外部依赖）。

与 local.py 的区别：

- **数据库用内嵌 SQLite**（默认落 `runtime/miniplane.sqlite3`），目标机器**不需要装 / 跑
  PostgreSQL** —— 这是"双击即用"的关键。仍允许用 `MINIPLANE_DATABASE_URL` 显式指向 Postgres
  生产库（保留原能力）。
- **DEBUG 关闭**：本地软件按生产方式跑，避免把调试页 / 堆栈暴露到窗口里。
- **SECRET_KEY 自动持久化**到 `runtime/secret_key`：首次运行随机生成、之后复用。若每次现生成，
  会话 cookie 签名会变，重启即被登出 —— 持久化后登录状态跨启动保留（session 存在 SQLite 里）。
- **CORS / CSRF 固定为本机页面地址**（127.0.0.1:3000 页面 ↔ 127.0.0.1:8000 API，同 host
  不同端口，规避会话 cookie / CSRF 跨站失效；见 README"一致性规则"与 commit 07d8f83 的教训）。
- Celery 同步执行（eager）、Channels 走内存层：均无 Redis / Docker 依赖。

所有端口 / 路径由 desktop/launcher.py 通过环境变量注入；本模块只提供"缺省即安全"的单机配置。
"""

import os
import secrets
from pathlib import Path

# BASE_DIR = backend/（本文件位于 config/settings/ 下，向上三级）
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_RUNTIME_DIR = _BACKEND_DIR.parent / "runtime"
_RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

# ── SECRET_KEY：持久化，缺则生成 ─────────────────────────────
_key_file = _RUNTIME_DIR / "secret_key"
if os.environ.get("SECRET_KEY"):
    _secret_key = os.environ["SECRET_KEY"]
elif _key_file.exists():
    _secret_key = _key_file.read_text(encoding="ascii").strip()
else:
    _secret_key = secrets.token_urlsafe(48)
    _key_file.write_text(_secret_key, encoding="ascii")
# base.py 用 environ 读取，且 read_env 不覆盖已存在的 os.environ，故先注入即生效
os.environ["SECRET_KEY"] = _secret_key

# ── 数据库：默认内嵌 SQLite；MINIPLANE_DATABASE_URL 可覆盖为 Postgres ──
# base.py 里 `env.db_url("DATABASE_URL")` 无默认值、缺了会在 import 期 raise，
# 所以先塞一个占位 URL 让 import 通过；真正的引擎在 import 之后按下面显式覆盖，
# 绕开 Windows 绝对路径塞进 `sqlite://` URL 的解析坑（盘符 / 前导斜杠）。
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
_PG_URL = os.environ.get("MINIPLANE_DATABASE_URL")

from .base import *  # noqa: E402,E403,F401,F403

if _PG_URL:
    # 显式指向 Postgres 生产库时沿用 base 的解析能力
    DATABASES = {"default": env.db_url("MINIPLANE_DATABASE_URL")}  # noqa: F405
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": str(_RUNTIME_DIR / "miniplane.sqlite3"),
            "OPTIONS": {"timeout": 20},  # 多线程写并发时等锁而非立即 database-is-locked
            "ATOMIC_REQUESTS": True,
            "CONN_MAX_AGE": 0,
        }
    }

# ── 覆盖为单机安全值 ─────────────────────────────────────────
DEBUG = False
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]

_PAGE_ORIGIN = os.environ.get("MINIPLANE_PAGE_ORIGIN", "http://127.0.0.1:3000")
CORS_ALLOWED_ORIGINS = [_PAGE_ORIGIN]
CSRF_TRUSTED_ORIGINS = [_PAGE_ORIGIN]

# 异步任务同步执行、实时走内存层：本机零外部依赖
CELERY_TASK_ALWAYS_EAGER = True
CELERY_BROKER_URL = "filesystem://"
if not CELERY_TASK_ALWAYS_EAGER:
    _celery_dir = _BACKEND_DIR / ".celery"
    _celery_dir.mkdir(parents=True, exist_ok=True)
    CELERY_BROKER_TRANSPORT_OPTIONS = {
        "data_folder_in": str(_celery_dir),
        "data_folder_out": str(_celery_dir),
        "store_processed": False,
    }

# 会话 / CSRF cookie 保持 Lax；本机同站不同端口，无需 Secure（HTTP）
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

STATIC_ROOT = _RUNTIME_DIR / "staticfiles"

# 桌面单机版数据目录（launcher 会读这个键放置 db / 快照）
MINIPLANE_RUNTIME_DIR = _RUNTIME_DIR
