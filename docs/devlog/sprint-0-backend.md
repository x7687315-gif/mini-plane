# Sprint 0 开发日志：环境与项目骨架（后端）

- 日期：2026-09-09
- 执行人：后端（beigui）
- 对应计划：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 0
- 分支：`main`（首个提交，无 feature 分支）

---

## 一、这次做了什么

Sprint 0 的目标是"两个人都能从全新目录把项目跑起来"，后端侧本次交付：

1. **基础设施**：Python 3.12.13 虚拟环境、PostgreSQL 16 本地安装、pip 清华源配置。
2. **Django 项目骨架**：`django-admin startproject config .` 后按计划重构为三层 settings（base/local/test），业务代码与配置分离。
3. **业务模块占位**：`apps/` 下建 5 个业务 app（users / workspaces / projects / issues / activity）+ `core/` 通用设施包，并完成 `apps.` 命名空间注册。
4. **通用模型基类**：`core.BaseModel`（UUID v4 主键 + created_at/updated_at），对应计划决策 D1/D8，后续所有业务模型继承它。
5. **第一个 API**：`GET /api/v1/health/`，真实探测数据库（`SELECT 1`），DB 不可达时返回 503 而非 500。
6. **API 文档链路**：接入 drf-spectacular，产出 `/api/schema/`（OpenAPI 3.0）与 `/api/docs/`（Swagger UI），作为前后端联调契约入口。
7. **工程化配置**：ruff（lint + format，规则集 E/F/W/I/UP/B/DJ）、requirements 三层拆分（base/local/test）、.env.example、.gitignore、README。
8. **GitHub 仓库**：`x7687315-gif/mini-plane`（public），首次提交推送。

## 二、怎么做的（关键实现说明）

### 2.1 Python 3.12 的调用方式

本机 Python 由 uv 管理，py launcher 注册名是 `Astral/CPython3.12.13`，所以 `py -3.12` 无效，要用完整标签：

```powershell
py -V:Astral/CPython3.12.13 -m venv .venv
```

坑：`py --list` 里显示的 `-V:3.14 *` / `-V:3.9` 是公司名省略形式，Astral 装的 3.12 必须带公司名前缀才能匹配。

### 2.2 settings 三层拆分

```text
config/settings/
├── base.py    # 公共：INSTALLED_APPS、DRF、spectacular、DATABASE_URL 读 env
├── local.py   # 本地：DEBUG=True，补充 ALLOWED_HOSTS
└── test.py    # 测试：DEBUG=False，MD5 密码哈希提速
```

`manage.py` 默认指向 `local`，`wsgi.py`/`asgi.py` 指向 `base`（部署友好）。敏感值全部走 `django-environ` 从 `.env` 读取，`.env` 不进 Git，仓库只留 `.env.example`。

### 2.3 apps 命名空间

startapp 后把每个 `apps.py` 的 `name` 从 `'users'` 改为 `'apps.users'`，避免深层 import 路径混乱（`from apps.users.models import ...` 一律成立）。

### 2.4 health 接口的设计取舍

- 用 `connections["default"].cursor()` 执行 `SELECT 1`，这是"真实探测"，比 DRF 自带的 health 装饰器更透明，教学上也讲得清。
- 数据库故障返回 **503 Service Unavailable**（语义：服务还活着，但依赖不可用），不是 500——500 会被编排系统当成"服务本身挂了"。
- schema 注解里显式 `auth=[]`，标记为匿名接口；200/503 两种响应形状都在文档里声明。

### 2.5 版本与计划的差异

| 依赖 | 计划写的 | 实际安装 | 原因 |
|------|----------|----------|------|
| djangorestframework | 3.16.x | 3.18.1 | 计划遵循"小版本取最新"，3.18 已是当前稳定线 |
| django-environ | 0.11.x | 0.14.0 | 同上 |
| drf-spectacular | 0.28.x | 0.30.0 | 同上 |
| Django / Python / PG | 5.2 LTS / 3.12 / 16 | 5.2.17 / 3.12.13 / 16 | 与计划一致 |

计划文档 §1.1 的版本表将在本次提交中同步更新，避免文档过期。

### 2.6 Docker 的排期调整

原计划 Sprint 0 安装 Docker Desktop，实际决定**延后到 Sprint 6 开工前**（Redis 才是第一个真实使用者），避免现在折腾 WSL2 与系统重启。已记入 BACKEND_PLAN §Sprint 0 备注。

## 三、验收结果

验收时间：2026-09-09 22:35，**全部通过** ✅

| 验收项 | 计划标准 | 结果 |
|--------|----------|------|
| 系统自检 | `manage.py check` 零问题 | ✅ 0 issues（deploy 检查的 DEBUG 提示为本地环境预期项） |
| 数据库 | PG 16 服务运行、miniplane 库 UTF8 | ✅ postgresql-x64-16 Running，PostgreSQL 16.15 |
| 迁移 | migrate 全部应用成功 | ✅ 18 项迁移应用完毕 |
| 单元测试 | health 探测 2 用例全绿 | ✅ Ran 2 tests, OK（含 DB 故障降级 503 用例） |
| 健康检查 | `GET /api/v1/health/` → 200 | ✅ 实测返回 `{"status":"ok","database":"ok"}` |
| API 文档 | `/api/schema/`、`/api/docs/` 均 200 | ✅ 实测通过 |
| Lint/Format | ruff check + format 零告警 | ✅ All checks passed（50 文件已统一格式） |

## 四、遇到的问题与解决

| 问题 | 现象 | 解决 |
|------|------|------|
| py launcher 找不到 3.12 | `py -3.12 --version` 报 no py312 | 用完整标签 `py -V:Astral/CPython3.12.13` |
| pip 直连 PyPI 超时 | 安装卡住 | 用户级配置清华源 `pip config set global.index-url` |
| startapp 目标目录不存在 | CommandError: Destination directory ... does not exist | 先 `mkdir apps/<name>` 再 startapp |
| ruff 报 20 个 F401 | startapp 模板占位 import 未使用 | `ruff check --fix` 自动清理，28 个文件统一 format |
| psql 不在 PATH | 命令行无 psql | 使用安装目录全路径 `C:\Program Files\PostgreSQL\16\bin\psql.exe` |

## 五、下一步（Sprint 1：User / Auth）

1. 与同学冻结 `docs/api/01-auth.md`（register / login / logout / me 四接口）。
2. User 模型（AbstractUser + UUID 主键 + email unique）。
3. 统一异常处理器 + 统一分页器（core/）。
4. CORS + CSRF 联调配置（前端 `credentials: 'include'` 联调）。
5. 完成计划中列出的 5 组测试用例（register/login/logout/me/越权）。

## 六、给同学的操作指引（前端）

```powershell
git clone https://github.com/x7687315-gif/mini-plane.git
cd mini-plane/backend
# 按 README「快速开始」配置 .env 后启动
python manage.py runserver
# 浏览器打开 http://127.0.0.1:8000/api/docs/ 即可看到实时 API 文档
```
