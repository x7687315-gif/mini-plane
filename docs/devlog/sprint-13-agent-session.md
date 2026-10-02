# Sprint 13 — Agent Session + WebSocket 实时投影

> 依据：[docs/PRODUCT_REFACTOR_PLAN.md](../PRODUCT_REFACTOR_PLAN.md) §13/§14/§23 + Sprint 13 定义。
> 目标：让"Agent 正在跑"这件事**实时**出现在桌面上——复用 Sprint 7 建好的 WebSocket 通道，
> 而不是新起一套推送。

## 做了什么

### 后端

- 模型 `AgentSession`（迁移 `agents/0002_agentsession`）：project / token(SET_NULL) /
  task(SET_NULL, 可关联到具体任务) / title / status(running|done|failed|stopped) /
  started_at / ended_at / note / `elapsed_seconds` 属性。索引 `(project,status)`。
- 服务 `apps/agents/services.py`：`start_session` / `end_session`，均在事务内并调用
  `realtime.broadcast.defer_agent_session`（on_commit 后广播，避免推"库里还没有"的状态）。
- 广播事件 **`agent.session`** 加入 `KNOWN_EVENTS`（契约 08 从两个事件扩到三个）；
  payload 带足渲染信息（title/status/elapsed/agent 名），前端无需回查。
- 端点（Agent Token 认证 + scope）：
  - `GET  /agent/projects/<slug>/<pid>/sessions/?active=1`（read_project）
  - `POST /agent/sessions/` 开始（write_task，幂等）
  - `POST /agent/sessions/<id>/end/` 结束（write_task；跨项目 404）
- `/projects/mine/` 增 `agent_running`（Exists 子查询，仍一条 SQL），首页卡片据此显示
  「Agent · Running」角标。

### 前端

- `stores/agentSession.ts`：按 projectId 存实时会话快照。
- `features/realtime/policy.ts`：新增 effect kind `agent-session`（纯函数，可单测）。
- `features/realtime/hooks.ts`：收到 `agent.session` → 写 store（即时投影）+ 失效首页 mine 查询。
- 项目页：运行中会话显示一条 Blueprint 风格的实时横幅（脉冲点 + AGENT · RUNNING + 标题 + 耗时）。
- 首页卡片：`agent_running` 时显示「· Agent · Running」角标。
- 单测：`realtime-policy.test.mts` 增 agent.session → agent-session 用例。

### 契约与测试修正

- `docs/api/08-realtime.md` 增 §2.3 `agent.session`（原"明确不做"顺延为 §2.4），头部事件清单更新。
- 修一条**既有 flaky 测试**：`test_list_is_ascending_by_time`（评论排序）在 Windows 墙钟粒度
  (~15ms) 下两条评论同 created_at → 排序 tie 按随机 UUID 打破 → 偶发失败。改为显式把第二条
  的 created_at 拉开 1s，保证确定性。
- 更新契约测试 `test_known_events_are_the_contract_list`（两事件 → 三事件）。

## 验证

- 后端：agents 11 例 + 全量 `Ran 334 tests OK`；ruff check/format、spectacular `--fail-on-warn` rc0、openapi 快照重生成、迁移双库（PG + SQLite）。
- 前端：tsc / eslint / 单测 99（含新 `agent-session` policy 用例）/ 生产构建全绿；Playwright E2E 23 全通过。
- 桌面版：`scripts/package.py` 重建 dist 成功（Next 生产构建 compiled，包组装 rc0）。
- 远端 CI：backend / frontend 两个 job 均 `success`。

## 下一步（Sprint 14）

Engineering Island MVP：Resting / Focus 两态 + 项目左右切换（一项目一 Island 页），
先不做复杂动画；数据源即本 Sprint 的 session + Sprint 10/11 的 plan/worklog。
