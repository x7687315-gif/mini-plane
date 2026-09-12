"""Sprint 8 本地静态校验：compose / CI workflow 的 YAML 语法与关键结构。

用法：.venv/Scripts/python.exe scripts/check_compose.py
（只做结构校验；本机无 Docker，真实 compose 解析待有 Docker 的机器验证。）
"""

import sys

import yaml

errors = []

with open("../docker-compose.yml", encoding="utf-8") as f:
    compose = yaml.safe_load(f)

services = compose.get("services", {})
for name in ["db", "redis", "init", "web", "asgi", "worker"]:
    if name not in services:
        errors.append(f"compose 缺少服务 {name}")

# YAML 锚点合并后，backend 服务应拿到完整的环境变量与镜像名
for name in ["init", "web", "asgi", "worker"]:
    svc = services.get(name, {})
    if svc.get("image") != "miniplane-backend:latest":
        errors.append(f"{name}: image 未解析为 miniplane-backend:latest")
    env = svc.get("environment", {})
    required_env = [
        "SECRET_KEY",
        "DATABASE_URL",
        "CACHE_URL",
        "CELERY_BROKER_URL",
        "CHANNEL_REDIS_URL",
    ]
    for key in required_env:
        if key not in env:
            errors.append(f"{name}: 环境变量 {key} 丢失（锚点合并失败？）")
    if not svc.get("depends_on"):
        errors.append(f"{name}: 缺少 depends_on")

for name in ["web", "asgi"]:
    if not services.get(name, {}).get("ports"):
        errors.append(f"{name}: 未映射端口")

deps = services.get("web", {}).get("depends_on", {})
if deps.get("init", {}).get("condition") != "service_completed_successfully":
    errors.append("web: 未等待 init 成功完成")
if services.get("db", {}).get("ports"):
    errors.append("db: 不应映射端口到宿主机（见 compose 头部注释）")

with open("../.github/workflows/ci.yml", encoding="utf-8") as f:
    ci = yaml.safe_load(f)
jobs = ci.get("jobs", {})
if "backend" not in jobs:
    errors.append("ci.yml 缺少 backend job")
steps = jobs.get("backend", {}).get("steps", [])
names = [s.get("name", "") for s in steps]
for required in ["ruff check", "迁移无漂移（makemigrations --check）", "全量测试"]:
    if required not in names:
        errors.append(f"ci.yml backend 缺少步骤：{required}")
services_ci = jobs.get("backend", {}).get("services", {})
if "postgres" not in services_ci or "redis" not in services_ci:
    errors.append("ci.yml backend 缺少 postgres/redis 服务容器")

if errors:
    print("FAIL")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("compose / ci.yml 结构校验全部通过")
