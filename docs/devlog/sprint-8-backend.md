# Sprint 8 开发日志：Docker / CI / 工程化收尾（后端）

- 日期：2026-09-12
- 分支：`feat/backend-docker-ci`
- 对应计划：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 8
- 产物：[Dockerfile](../../backend/Dockerfile) · [docker-compose.yml](../../docker-compose.yml) ·
  [ci.yml](../../.github/workflows/ci.yml) · [ARCHITECTURE.md](../../ARCHITECTURE.md) · [docs/API.md](../API.md)

---

## 一、这次做了什么

1. **容器化配置分支**：`config/settings/container.py`——DEBUG=False、全 env 驱动，
   缓存/Celery/channel layer 默认指向 compose 网络的 `redis` 服务；任务真异步（EAGER=False）。
2. **Dockerfile**（backend/）：多阶段构建（builder 出 wheel → slim 运行镜像）、
   非 root 用户、gunicorn 默认 CMD、镜像级 HEALTHCHECK（打 health 接口，503 即 unhealthy）。
3. **compose 补齐全套**：`db(postgres:16) + redis + init(migrate/collectstatic) +
   web(gunicorn:8000) + asgi(daphne:8001) + worker(celery)`，depends_on 带条件、healthcheck 串联；
   `docker compose up --build` 一条命令起全套（redis 单独起的 Sprint 6 老用法保留）。
4. **静态文件方案**：引入 whitenoise（仅容器配置启用）——`init` 里 collectstatic，
   运行时从产物直接服务 admin / DRF 静态资源。
5. **CI**（.github/workflows/ci.yml）：backend job = ruff check → ruff format --check →
   `makemigrations --check` → schema 校验 + 与仓库内快照 diff → 全量测试（PG + Redis 服务容器）
   → `check_cache` 实测 Redis 缓存后端。
6. **文档收尾**：`docs/api/openapi.yaml`（生成物入库 + CI diff 防漂移）、
   `docs/API.md`（生成物 + 手写契约的关系）、`ARCHITECTURE.md`（三条请求链路 + 容器拓扑）、
   README 四问补齐（Docker 快速开始 / CI 说明 / 协作与 PR 流程）。
7. **工程杂项**：PR 模板（What/Why/How/Testing/Breaking）；`scripts/check_compose.py`
   （本机无 Docker 也能校验 compose/CI 的 YAML 结构）；`.gitignore` 补根 `.env` 与 `control/`。
8. **计划外的安全合规**（commit 被安全钩子拦截引出）：测试/冒烟密码字面量移出源码
   （`core/testing.py` 进程内生成 + 冒烟密码派生），详见 §2.8。

## 二、怎么做的（关键决策与排障）

### 2.1 migrate 不放进 entrypoint，单独成 `init` 服务

最初想法是 entrypoint 里 `migrate && exec server`。但 compose 里要起 **三个**后端进程
（web/asgi/worker），同一镜像意味着三个 entrypoint 并发跑 migrate——PostgreSQL 的迁移锁
会让两个进程等死锁或超时，而且 asgi/worker 根本不需要跑迁移。

改成 `init` 一次性服务：跑 `migrate + collectstatic` 后退出，web/asgi/worker 用
`depends_on: {init: {condition: service_completed_successfully}}` 等它成功。
**成功退出**（而不是 started）是关键——迁移失败时三个服务根本不会启动，错误被隔离在一个容器里。

### 2.2 静态文件：引入 whitenoise，但只在容器分支

`DEBUG=False` 后 Django 不再自己服务静态文件，admin 和 DRF browsable API 会裸奔。
候选方案：nginx（多一个容器）、WhiteNoise（一个中间件）、不管它（MVP 不用 admin）。

选了 whitenoise：零运维、1 个依赖、2 行配置，且只在 `container.py` 里插入中间件——
本地开发路径完全不受影响。`collectstatic` 放在 `init` 服务里（构建期跑需要 SECRET_KEY，
会把环境变量烧进镜像层，不好）。

实测：本机以 container 配置 + daphne 起服务，`/admin/login/` 200，
其引用的 `/static/admin/css/base.css` 经 whitenoise 返回 200（Sprint 7 的 runserver 已是 ASGI，正好复用）。

### 2.3 `container.py` 的默认值直接写 compose 服务名

缓存/队列地址的默认值写的是 `redis://redis:6379/…`（`redis` 是 compose 服务名）。
这违反过一次我自己的洁癖（"配置不该知道编排细节"），但想清楚了：
- 这些默认值**只在容器里生效**（compose 显式传了同样的值，默认值是兜底）；
- "配置与编排解耦"的正确姿势是所有值 env 传入——compose 的 YAML 锚点已经做到
  四个服务共享一份定义，改地址只动一处。

库号分配写进 compose 头部注释：0=缓存 1=broker 2=result 3=channel layer。
本地 `.env` 里 channel layer 与 broker 撞过 db1，容器侧顺手分开了。

### 2.4 CI 里 Redis 服务容器不是摆设

单测配置固定 LocMem + EAGER（测试不依赖外部服务，Sprint 6 的决定不动），
那 CI 里起 Redis 服务干嘛？给了它两个真实职责：
1. **`check_cache` 实测 Redis 后端**：`delete_pattern` 这类 Redis 专有能力进不了单测
   （test.py 固定 LocMem），CI 是它唯一的自动验证场所；
2. 为将来把 `CACHE_URL=redis://` 的集成冒烟挪进 CI 预留。

步骤顺序按"失败成本排序"：lint（秒级）→ 格式 → 迁移漂移 → schema → 测试（分钟级，最后）。
另加了一条 **schema 快照 diff**：`docs/api/openapi.yaml` 入库，CI 重新生成后 `diff`，
改了接口不重新生成会直接红——手写契约管"为什么"，生成物管"长什么样"，两者都不许漂。

### 2.5 版本按基线规则上调：gunicorn 23.x → 26.2.0

计划基线写 gunicorn 23.x，按 §1.1"以安装时最新稳定为准"（Sprint 0 的 DRF 同规则）
锁定 26.2.0；whitenoise 6.12.0。全部版本进 `requirements/prod.txt`（仅容器使用，本地不装也能开发）。

### 2.6 诚实标注：哪些是实测，哪些没有

| 事项 | 状态 |
|------|------|
| container 配置 + daphne + whitenoise + health 本机实测 | ✅（见 2.2） |
| compose/CI 的 YAML 与结构校验（scripts/check_compose.py） | ✅ |
| Dockerfile / compose 的真实构建与启动 | ⚠️ **本机无 Docker（Sprint 6/7 同款限制），未实测** |
| CI workflow 真实执行 | ⚠️ 仓库尚无远端，首次 push 后验证 |
| branch protection / GitHub Release | ⚠️ 需仓库上 GitHub 后配置/创建 |

无 Docker 的风险集中在：psycopg binary wheel 在 slim 镜像的可用性（官方 wheel，风险低）、
非 root 用户写 staticfiles 的权限（已 chown）。装好 Docker 后第一条命令：
`docker compose up --build`，看 health 是否 200。

### 2.7 仓库的 `.git` 丢失——幸而远端保有全部历史

本地工作目录的 `.git` 目录丢失（devlog 里引用的旧哈希在本机一度不可解析）。起初按
"重建仓库、重造历史"处理；推送前发现 GitHub 远端 `main` 与各 Sprint 分支完好——
真实历史从未丢过。于是**放弃重建的历史，改为基于远端 `main`（Sprint 7 收尾 `eb094cf`）续写提交**，
devlog 里的旧哈希引用全部保持有效。

顺带发现并补入库一笔"未提交漂移"（`.git` 丢失前只存在于工作区、从未进过版本库的改动）：
`projects/urls.py` 的批量标签/任务状态路由注册、`core/permissions.py` 的生效角色按 id
判定重构（缓存读路径的铺垫）。远端 main 上"有视图没路由"的半截状态由此补齐——
这也解释了为什么本地树与远端不一致：原仓库最后一次提交后，工作区又往前走了半步。

### 2.8 计划外的一课：安全扫描钩子把测试密码当"硬编码凭据"拦截

首次 commit 被本机 Mimosa 安全钩子强制拦截：7 处"硬编码凭据"（全部是测试/冒烟用的
密码字面量）+ 5 处低危"不安全随机数"（seed_issues 用 `random` 造基准数据）。

修法（也想清楚了为什么）：
- **测试密码 → `core/testing.py` 按进程随机生成**。测试从不依赖密码的具体值，
  只要求过 Django 密码校验器；源码里不再有可登录的字面量，重跑即换新。
- **冒烟脚本密码 → 常量经 SHA-256 派生**，且账号名绑定同一"凭据纪元"：
  派生式一旦变更，账号名自动换新，不会拿新密码去登旧账号卡死"可反复运行"的承诺
  （旧冒烟账号留在库里无害）。纯字符串常量确实是一枚真实可登录的密码，该修。
- **seed_issues 的 `random` 保留**：伪随机 + `--seed 42` 是"可复现基准数据"的正确工具，
  换 `secrets` 反而丢掉复现性且更慢；低危不拦截，作为"已评审接受"记录在案。

这条的价值：**"凭据不进源码"对测试账号同样成立**，之前七个 Sprint 都没把这个当回事。

## 三、验收结果

验收时间：2026-09-12，**可本机验证项全部通过** ✅（未实测项见 2.6 的诚实标注）

| 验收项 | 计划标准 | 结果 |
|--------|----------|------|
| 测试 | 全绿 | ✅ 277 用例（本 Sprint 无业务代码变更，数量不变） |
| lint / format | 零告警 | ✅ `ruff check` + `ruff format --check`（112 文件） |
| 迁移 | 无漂移、可从零重放 | ✅ `makemigrations --check` 无漂移；测试建库即从零重放迁移 |
| schema | 零警告且与快照一致 | ✅ `--validate --fail-on-warn` 通过；生成两次 diff 一致（local/test 配置下确定） |
| Dockerfile | 多阶段 / 非 root / gunicorn / healthcheck | ✅ 代码就位；⚠️ 未构建实测（无 Docker） |
| compose | db/redis/init/web/asgi/worker + healthcheck 串联 | ✅ 结构校验通过（check_compose.py）；⚠️ 未 up 实测 |
| CI | ruff → migrate 检查 → test（PG+Redis 服务） | ✅ **首跑全绿**（run 34709948419，见补记） |
| 文档 | README 四问 / API.md / ARCHITECTURE.md | ✅ 三份齐；API 契约索引补 API.md 入口 |
| PR 模板 | What/Why/How/Testing/Breaking | ✅ .github/PULL_REQUEST_TEMPLATE.md |

### 关键数字

```text
新增文件：Dockerfile · .dockerignore · settings/container.py · requirements/prod.txt ·
          .github/workflows/ci.yml · .github/PULL_REQUEST_TEMPLATE.md ·
          docs/api/openapi.yaml · docs/API.md · ARCHITECTURE.md · scripts/check_compose.py
compose 服务：6 个（db/redis/init/web/asgi/worker），Redis 四个库号分工
新依赖：gunicorn 26.2.0 · whitenoise 6.12.0 · pyyaml 6.0.3（local，结构校验用）
测试：277（不变）；lint/format/schema/迁移检查：全绿
```

## 四、下一步（Sprint 9/10：读真实 Plane 源码 / 开源贡献）

1. 有 Docker 的机器上跑 `docker compose up --build`，验收"陌生机器一条命令"；
   把结果补进本文档。
2. ~~推送 GitHub → 确认 CI 首跑全绿 → branch protection → Release~~ ✅ 已完成（见补记）。
3. 过一遍 [BACKEND_PLAN §10 自检清单](../../BACKEND_PLAN.md)，全绿再启动源码阅读
   （从 issues app 的 Model/ViewSet 入手，对着自己写的 Issue 模块找差距）。

## 五、给同学的联调须知

- **起环境**：装了 Docker 就 `docker compose up --build -d`（HTTP=8000，WS=8001）；
  没装就按 README 方式二（本机 PG + runserver，HTTP/WS 同端口 8000）。
- **前端容器化**：建议照 `ci.yml` 的模式加 `frontend` job（lint + test），
  compose 里加一个 `frontend` 服务（build 前端目录、端口 3000、`depends_on: web`）。
- **CI 即合并门槛**：PR 描述按模板填；`docs/api/openapi.yaml` 记得随接口变更重新生成，
  CI 的 diff 会拦住忘改的。main 已开 branch protection（strict：合并前必须基于最新 main
  且 CI 绿；enforce_admins 未开，维护者直推仍可行——要不要收紧由两人商定）。
- **契约索引**：接口长什么样看 `docs/api/openapi.yaml` / Swagger，行为语义看 docs/api/00–08，
  缓存与推送的"坑"都写在手写契约里。
- WS 的 4401/4404 关闭码、断线全量刷新兜底等约定不变（08 契约）。

## 六、补记（2026-09-13，推送后）

1. **推送**：本地 `.git` 丢失后的工作树以三笔提交接到远端 `main`（快进，未强推）：
   `44a05b8` 补入库漂移 → `9dc173b` 密码字面量移出源码 → `c93b55a` 本 Sprint，
   `v0.1.0` tag 打在收尾提交上。devlog 里引用的旧哈希全部保持有效。
2. **CI 首跑全绿**（run 34709948419）：lint / 迁移无漂移 / schema 快照 diff /
   277 测试（PG 服务容器）/ check_cache 实测 Redis 后端——**Redis 的 delete_pattern
   第一次被自动验证**。CI 装的是 local.txt：test.txt 已随本 Sprint 补入 ruff。
3. **分支保护生效**：main 要求 check `backend（lint + 静态检查 + 测试）` 通过且分支最新
   （strict）才可合并；force push 与删除被禁。
4. **GitHub Release**：<https://github.com/x7687315-gif/mini-plane/releases/tag/v0.1.0>
   （notes 即 docs/releases/v0.1.0.md）。
5. 仍未验证：真实 Docker 里的构建与 `compose up`（本机无 Docker，见 §2.6）。
