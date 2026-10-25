# 项目解剖图 · 实施报告（Round 2-4 · 复合 PLATE 视图）

> 依据：`ANATOMY_REVIEW.md` 三维审查结论（复合 PLATE 9.2 分采纳）。
> 状态：**MVP 已实现并实测**。分支 `refactor/personal-first-domain`。

## Round 2 · 组件层（7e5c9b7）

`frontend/components/anatomy/AnatomyPlate.tsx`——按规格 §6.2 分层实现：

| 层 | 实现 |
|---|---|
| View model | `groups`（Stage→Task 分组，`stage` 为空进散件）、`loose`、`nowTask`（state.group=started 首个） |
| Layout | 确定性布局（全景：对角网格；聚焦：选中板放大至中景、其余压薄为 34px 基线条）——重渲染不换位 |
| SVG 渲染 | 等距引擎（box/cellCube/scatter）+ **建筑原型按任务密度选择**：0 任务=foundation 虚线基座、1-3=openbox、4-6=portal、7+=campus——几何服务真实组织 |
| 交互 | 点阶段/索引行=聚焦切换；点任务=现有 `?issue=` 抽屉；◂整体恢复 |
| 可达性 | 索引表与构件清单是 HTML button（键盘可达）；SVG 构件为视觉增强，aria-label 完整 |

**语义红线全部落实**：无 Task↔Task 依赖线（投影点线明确标注「非依赖」）；散件中性可见（虚线托盘+计数，不羞辱）；NOW 只在真实 started 任务时显示引线；Agent 只显示真实运行态；阶段进度/构件统计/总进度分列。

**信息面板（C 层）**：Stage Index（右上，点击=聚焦）、构件清单（右下，点击=开抽屉）、图例（左下，5 项含「投影辅助线（非依赖）」）、图签（identifier/年份/READ-ONLY）。

## Round 3 · 集成与实测（019bb68 + 热修 a4290e1）

- 工程台头部视图切换：**工作台 ⇄ 图纸**（`?view=plate` URL 语义，可分享、可后退）；日志/设置仅工作台视图显示。
- **实测发现并修复两个真 bug**：
  1. **双壳**：页面在 layout 的 AppShell 内又渲染了一层 AppShell → 双 TopBar/双 Rail/Alt+I 双触发。修复：页面改用 `useChrome` 声明壳层（019bb68）。
  2. **缓存命中 404（热修 a4290e1，本轮最重要修复）**：私人工程详情**首次 GET 200、第二次 GET 404**。根因：缓存载荷 JSON 往返后 `owner` 是字符串，`user.id` 是 UUID，owner 短路的 `==` 恒为 False → 回落成员表查询 → 私人工程无 ProjectMember → None → 404。修复 `effective_role` 的 `str()` 归一 + 回归测试（同详情 GET 两次双 200）+ `test_cache` 暖读断言更新（owner 暖读 0 查询——性能改进；非 owner 对照 1 查询防短路放行）。

## 实测记录（真实栈 + 真实交互，浏览器截图为证）

| 步骤 | 结果 |
|---|---|
| 登录 anat_probe → 首页 | ✓ |
| `/projects/{pid}?view=plate` 总览 | ✓ 三阶段构件（foundation 原型，各 2 构件）+ 索引面板 + 图例 + 图签；暗色主题 token 自适应正常 |
| 点击索引行「收束验收」 | ✓ 聚焦：该阶段展开、其余压薄、构件清单面板出现 |
| 点击构件「ANAT-5 联调测试」 | ✓ 抽屉打开（URL `?view=plate&issue=…`），状态诚实显示 Backlog（未推进就不伪造 NOW） |
| 缓存命中二访 | 修复后 200/200（修复前 200→404） |

探针数据：`anat_probe` / Anatomy Probe 2（3 阶段、6 归属任务、1 散件、1 Worklog、1 进行中）。

## 门禁

前端：typecheck / lint（0 warning） / 143 单测 / build 全绿。后端：382 测试全绿 + ruff + format。

## 遗留（TECH_DEBT）

- TD-01 E2E 共享会话 / TD-09 抽屉字段区完整 v2 化 / TD-10 filter-bulk 适配（不变）。
- 解剖图后续可选：聚焦态的 lifted-cells 动效、Island 缩略楼栋图、Worklog 边缘批注密度提升（当前 1 条示意已可读）。
