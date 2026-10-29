# 下一周期 Preflight：轻量化 / 流畅性 / 日常便捷性

> 日期：2026-10-29 · 范围：Anatomy 视觉验收、Island Blueprint Dock、移动端路线、交互连续性。
> 本文只做调研与方案输入，不替代 Phase 1–4 的阶段报告。

## 0. 检索台账

> 无 `gh` CLI / GitHub 登录；使用 WebSearch 语义召回 + GitHub REST API + 官方文档。
> GitHub 代码结构搜索面未取得公开样本，已用本地组件审查与官方代码示例补齐。

| # | 信息面 | Query / 来源 | 命中与结论 |
|---|---|---|---|
| 1 | 仓库 / 安全 | `getpaseo/paseo security localhost tailscale phone` | <https://github.com/getpaseo/paseo/blob/main/public-docs/security.md>：本地 daemon 默认只绑 127.0.0.1；手机访问需要额外绑定与访问控制，不能把本地端口当作公网入口 |
| 2 | Issues | `repo:WICG/private-network-access localhost phone` | <https://github.com/WICG/private-network-access/issues/23>（69 评论）与 <https://github.com/WICG/private-network-access/issues/117>：浏览器对局域网/localhost 的私有网络访问有权限与安全上下文限制 |
| 3 | Issues 评论正文 | `repo:WICG/private-network-access in:comments localhost phone`（GitHub Issues API） | 命中 #23：评论区反复讨论“局域网明文连接没有完整替代方案”，手机直连本地 HTTP 不是无成本方案 |
| 4 | Discussions | `Kill process on exit tauri discussion job object`（语义检索） | <https://github.com/orgs/tauri-apps/discussions/3273>：桌面壳层的进程生命周期需要 OS 级兜底；与本轮 Island/桌面连续性边界相关 |
| 5 | PR | `repo:WICG/private-network-access pull request non-fetch` | <https://github.com/WICG/private-network-access/pull/125>：PNA 规范仍在演进，移动端直连不能假定浏览器行为稳定 |
| 6 | 外部 / 官方 | `Tailscale Serve localhost web app tailnet` | <https://tailscale.com/kb/1242/tailscale-serve>：Serve 可把 localhost 服务通过 tailnet 暴露，不需要应用绑定 0.0.0.0 |
| 7 | 外部 / 官方 | `React useOptimistic rapid actions stale state` | <https://react.dev/reference/react/useOptimistic#caveats>：复杂更新应使用 reducer/最新 base state；旧异步结果不能覆盖新意图（官方文档） |
| 8 | 代码面 | 本地 `frontend/components/anatomy/*`、`frontend/components/issue/IssueDrawer.tsx`、`frontend/components/ui/Drawer.tsx` 审查 | 图纸快速切换当前最终状态正确；抽屉关闭后焦点回到 `BODY`（已复现），是可访问性/上下文连续性问题 |
| 9 | 外部 / PWA | `PWA secure context service worker localhost`（语义检索） | MDN PWA 文档：Service Worker 需要安全上下文；PWA 不是“窄屏 CSS”的同义词，需独立的安装/缓存/更新策略 |

**置信度**：官方文档高；GitHub Issue/PR 高；社区讨论中；本地复现为实测。
**未找到**：与 Mini Plane 完全同构的 Island 视觉组件库/开源实现；Island 造型按本项目 DESIGN/ISLAND_V3_SPEC 约束自行设计，不引用外部 UI 套件。

## 1. 关键结论

1. **移动端不能默认改监听地址**：PNA/localhost 限制、身份验证、TLS、数据暴露都需要单独设计。
2. **Tailscale Serve 是可行的“受控网络”路径**：应用继续只绑 `127.0.0.1`，由 Serve 代理到 tailnet；但仍是新增依赖与运维选择，不能默认开启。
3. **Island 视觉必须先原型**：当前生产仍是 14px 项目卡 + 26px 外框 + 阴影，和 `DESIGN.md` §3.3 / `ISLAND_V3_SPEC` §0 的 4–8px、项目 0px 细线分隔冲突；先做独立原型，不直接改生产。
4. **交互连续性先修焦点与状态，不先上动画库**：抽屉关闭后焦点丢失已复现；Growth ↔ Structure 快速反向切换当前最终 URL/选中 Stage 正确，不需要全局状态重构。

## 2. 可选方向

### 方向 A · 窄屏浏览器适配（本轮可先做研究/低保真）

- 适用：桌面窗口变窄、平板/近场浏览器查看；不能解决真正的手机跨设备访问。
- 成本低，不影响本地安全边界；Structure 纵向阅读可作为移动视觉起点。
- 限制：手机仍无法访问 127.0.0.1。

### 方向 B · 受控网络访问（推荐作为下一实验，不默认开启）

- 应用继续绑 `127.0.0.1`；用户显式启用 Tailscale Serve / 受控反向代理，手机通过 tailnet 访问。
- 需要：身份验证、连接状态展示、失败恢复、文档与关闭开关；不把 0.0.0.0 写进默认配置。
- 代价：新增外部网络层；需要真实手机测试，不在本轮直接实现。

### 方向 C · 独立 PWA / 移动端（暂缓）

- 需要安全上下文、安装/缓存/更新、离线与同步策略；与桌面 SQLite 单机模型之间要明确数据关系。
- 成本和维护负担最高，本轮不启动。

**倾向**：本轮 Phase 3 给出 A + B 的决策报告，B 仅作为显式实验；C 明确暂缓。Phase 2 只做 Island 独立原型；Phase 4 先做已复现的焦点/连续性最小修复。
