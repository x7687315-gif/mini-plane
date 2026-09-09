# Mini Plane

仿 [Plane](https://github.com/makeplane/plane) 的迷你项目管理软件（双人学习项目）：从 0 实现用户、工作区、项目、任务（Issue）管理的完整业务链路，最终目标是具备阅读并贡献真实 Plane 源码的能力。

- 开发路线与后端执行计划：[BACKEND_PLAN.md](BACKEND_PLAN.md)
- 开发日志（每个阶段做了什么、怎么做的）：[docs/devlog/](docs/devlog/)

## 技术栈

| 端 | 技术 |
|------|------|
| Backend | Python 3.12 · Django 5.2 LTS · Django REST Framework · PostgreSQL 16 |
| Frontend | React + TypeScript（同学负责，待补充） |
| 后续引入 | Redis · Celery · WebSocket（Channels） · Docker · GitHub Actions CI |

## 目录结构

```text
backend/     Django 后端（config/ 配置 · apps/ 业务模块 · core/ 通用设施）
docs/        开发日志与 API 契约（docs/api/ 自 Sprint 1 起建立）
```

## 快速开始（后端）

```powershell
# 1. 进入后端目录并创建虚拟环境（需要 Python 3.12）
cd backend
py -V:Astral/CPython3.12.13 -m venv .venv     # 或系统安装的 python -m venv .venv
.venv\Scripts\activate

# 2. 安装依赖（建议先配置清华 pip 源）
python -m pip install -r requirements/local.txt

# 3. 配置环境变量：复制 .env.example 为 .env，填入 SECRET_KEY 与 DATABASE_URL
#    并确保本地 PostgreSQL 已建库 miniplane

# 4. 迁移并启动
python manage.py migrate
python manage.py runserver
```

启动后：

- 健康检查：<http://127.0.0.1:8000/api/v1/health/>
- API 文档（Swagger）：<http://127.0.0.1:8000/api/docs/>

## 运行测试

```powershell
python manage.py test --settings=config.settings.test --noinput
```

## 协作约定

- 分支：`feat/backend-<模块>-<简述>` / `feat/frontend-<模块>-<简述>`，不直接推 main
- Commit：`<type>(backend|frontend): <简述>`
- API 先冻结契约（docs/api/）再开发，契约变更走 PR
