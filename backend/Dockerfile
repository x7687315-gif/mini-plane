# Mini Plane 后端镜像（Sprint 8）。
#
# 通常不直接 docker build，而是从仓库根目录：
#     docker compose up --build
#
# 多阶段构建的两个目的：
#   1) builder 阶段先把依赖做成 wheel——依赖层与代码层分离，改业务代码不重装依赖；
#   2) 运行镜像用 slim + 非 root 用户，不带 pip 构建工具链。
#
# 服务器分工（CMD 可被 compose 覆盖）：
#   web    → gunicorn（HTTP API，默认 CMD）
#   asgi   → daphne（HTTP + WebSocket，compose 覆盖 CMD）
#   worker → celery（异步任务，compose 覆盖 CMD）
#   init   → migrate + collectstatic（compose 覆盖 CMD，跑完即退出）

# ── 阶段一：依赖 wheel 构建 ─────────────────────────────────
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# 先只 COPY requirements：这一层不因业务代码改动而失效（Docker 层缓存的关键）
COPY requirements/ requirements/
RUN pip wheel --wheel-dir /wheels -r requirements/prod.txt

# ── 阶段二：运行镜像 ────────────────────────────────────────
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # 容器内所有进程（gunicorn/daphne/celery/一次性 init）统一用容器配置，
    # manage.py / celery.py / asgi.py 里的 setdefault 不会覆盖这里
    DJANGO_SETTINGS_MODULE=config.settings.container

# 非 root 用户：应用代码与 staticfiles 目录都属于它
RUN groupadd --system mini && useradd --system --gid mini --create-home mini

WORKDIR /app

# 从 builder 装 wheel 闭包：--no-index 保证运行镜像里不碰 PyPI、可复现。
# requirements 必须先于业务代码 COPY —— 否则这条 RUN 拿不到 prod.txt（构建直接失败）。
COPY requirements/ requirements/
COPY --from=builder /wheels /wheels
RUN pip install --no-index --find-links=/wheels -r requirements/prod.txt \
    && rm -rf /wheels

# 业务代码（放最后，改动最频繁的一层）
COPY . .
RUN mkdir -p staticfiles && chown -R mini:mini /app

USER mini

EXPOSE 8000
# 容器内自检：health 探测 DB + 缓存，任一不可用返回 503，
# urllib 对非 2xx 抛异常 → 非零退出 → 容器标记 unhealthy（编排靠它做故障感知）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/', timeout=4)"

CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", "--threads", "2", "--timeout", "60", \
     "--access-logfile", "-", "--error-logfile", "-"]
