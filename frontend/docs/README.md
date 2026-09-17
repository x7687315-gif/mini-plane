# frontend/docs

前端的文档索引。每个 Sprint 一篇开发日志（`devlog/`），设计稿与截图放 `assets/`。

## 开发日志

每篇的结构：**做了什么 → 怎么做的 → 踩坑 → 验收结果 → 产出文件 → 下一步**。
与后端 [docs/devlog/](../../docs/devlog/) 同一套节奏，但记录的是前端自己的取舍。

| Sprint | 主题 | 状态 | 日志 |
|--------|------|------|------|
| 0 | 脚手架 + 设计系统（Next.js + AppShell + 基础组件 + 404） | ✅ 已完成 | [sprint-0-frontend.md](devlog/sprint-0-frontend.md) |
| 1 | Auth 闭环（/login + /register + /me + AuthGuard） | ✅ 已完成 | [sprint-1-frontend.md](devlog/sprint-1-frontend.md) |
| 2 | Workspace + Project（Dashboard / 项目列表 / 新建 / 成员 / 设置） | ✅ 已完成 | [sprint-2-frontend.md](devlog/sprint-2-frontend.md) |
| 3 | Issue 核心（列表 + 详情抽屉 + 就地编辑 + 筛选） | ✅ 已完成 | [sprint-3-frontend.md](devlog/sprint-3-frontend.md) |
| 4 | Comment + Activity（抽屉内对话 + 审计时间线） | ✅ 已完成 | [sprint-4-frontend.md](devlog/sprint-4-frontend.md) |
| 5 | Search + Filter + Sort + URL 同步 | ✅ 已完成 | [sprint-5-frontend.md](devlog/sprint-5-frontend.md) |
| 6 | BulkActionBar + 异步任务 | ✅ 已完成 | [sprint-6-frontend.md](devlog/sprint-6-frontend.md) |
| 7 | WebSocket Realtime | ⏳ 计划 | — |
| 8 | Docker + CI + 收尾 | ⏳ 计划 | — |

## 一个 Sprint 收尾时的固定动作

1. 代码：所有屏幕按 [SCREEN_BLUEPRINTS.md](../SCREEN_BLUEPRINTS.md) 实现，设计规则遵守 [DESIGN.md](../DESIGN.md)；
2. 一篇本目录 `devlog/sprint-N-frontend.md`；
3. **四绿**：`pnpm test` + `pnpm typecheck` + `pnpm lint` + `pnpm build`；
4. 更新三处进度：[README.md](../../README.md)、[FRONTEND_ROADMAP.md](../FRONTEND_ROADMAP.md)、本文件；
5. 涉及新契约的，把对应 `docs/api/0x-*.md` 的状态从「待前端确认」推进到「冻结」；
6. commit（`feat(frontend): Sprint N — …`）→ push。

## assets/

设计稿与截图，清单见 [assets/README.md](assets/README.md)。
`assets/src/*.html` 是**纯静态视觉稿**（给文档看的），不是产品代码；产品代码在 `app/**` 与 `components/**`。
