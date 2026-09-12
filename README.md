# Mini Plane

仿 [Plane](https://github.com/makeplane/plane) 的迷你项目管理软件（双人学习项目）：从 0 实现用户、工作区、项目、任务（Issue）管理的完整业务链路，最终目标是具备阅读并贡献真实 Plane 源码的能力。

- 开发路线与后端执行计划：[BACKEND_PLAN.md](BACKEND_PLAN.md)
- 架构总览（请求/推送/任务三条链路 + 容器拓扑）：[ARCHITECTURE.md](ARCHITECTURE.md)
- 开发日志进度索引：[docs/devlog/README.md](docs/devlog/README.md)（进度总览 + 每 Sprint 一篇：做了什么、怎么做的）
- 接口契约（前后端唯一事实来源）：[docs/API.md](docs/API.md) 与 [docs/api/](docs/api/)

## 技术栈

| 端 | 技术 |
|------|------|
| Backend | Python 3.12 · Django 5.2 LTS · Django REST Framework · PostgreSQL 16 |
| 异步与实时 | Redis · Celery · WebSocket（Channels/daphne） |
| 工程化 | Docker Compose · GitHub Actions CI · ruff · drf-spectacular |
| Frontend | React + TypeScript（同学负责，待补充） |

## 快速开始（后端）

### 方式一：Docker 一键起全套（推荐，需要 Docker Desktop / Docker Engine）

```bash
docker compose up --build -d
```

起来之后：

| 入口 | 地址 |
|------|------|
| 健康检查 | <http://127.0.0.1:8000/api/v1/health/> |
| API 文档（Swagger） | <http://127.0.0.1:8000/api/docs/> |
| WebSocket | `ws://127.0.0.1:8001/ws/...`（与 HTTP 分开的端口，见 [08 契约](docs/api/08-realtime.md)） |

敏感值（`SECRET_KEY` / `POSTGRES_PASSWORD` / 前端跨域地址）可在仓库根目录建 `.env` 覆盖，默认值仅供本地开发。

### 方式二：本地开发（不依赖 Docker）

```powershell
# 1. 进入后端目录并创建虚拟环境（需要 Python 3.12）
cd backend
py -V:Astral/CPython3.12.13 -m venv .venv     # 或系统安装的 python -m venv .venv
.venv\Scripts\activate

# 2. 安装依赖（建议先配置清华 pip 源）
python -m pip install -r requirements/local.txt

# 3. 配置环境变量：复制 .env.example 为 .env，填入 SECRET_KEY 与 DATABASE_URL
#    并确保本地 PostgreSQL 已建库 miniplane

# 4. 迁移并启动（runserver 已由 daphne 接管，HTTP + WebSocket 同端口 8000）
python manage.py migrate
python manage.py runserver
```

## 运行测试

```powershell
python manage.py test --settings=config.settings.test --noinput
```

CI（GitHub Actions）跑的是同一套：ruff check / ruff format --check / 迁移无漂移 /
schema 校验与快照一致 / 全量测试（PostgreSQL + Redis 服务容器）/ Redis 缓存实测。

## 协作约定

- 分支：`feat/backend-<模块>-<简述>` / `feat/frontend-<模块>-<简述>`，不直接推 main
- Commit：`<type>(backend|frontend): <简述>`
- PR 按模板（What / Why / How / Testing / Breaking Changes，见 [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)）
- main 开 branch protection：CI 全绿 + 双向 Review 通过才可合并
- API 先冻结契约（docs/api/）再开发，契约变更走 PR；改了接口必须重新生成 `docs/api/openapi.yaml`（CI 校验一致性）
