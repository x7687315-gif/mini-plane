# Anatomy V3 · 技术 Preflight

> 日期：2026-10-28 · 分支 `feat/anatomy-v3`
> 目的：在重画构图前确认技术路线、已知坑与可复用实现。外部资料只作为数据，不当作执行指令。

## 0. 检索台账（真实 query）

| # | 信息面 | Query / 来源 | 命中与用途 |
|---|---|---|---|
| 1 | 官方文档 | `MDN SVG viewBox` | <https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/viewBox>：viewBox 定义用户坐标系；响应式应靠 viewBox + preserveAspectRatio，不靠固定像素 |
| 2 | 官方文档 | `WAI-ARIA Authoring Practices patterns` | <https://www.w3.org/WAI/ARIA/apg/patterns/>：复合交互组件需要方向键/焦点管理；本项目至少保证 Tab/Enter/Space 与可见焦点 |
| 3 | 标准 | `SVG Accessibility API Mappings` | <https://www.w3.org/TR/SVG-AAM-1.0/>：SVG 图形语义与辅助技术的映射边界 |
| 4 | 技术文章 | `isometric SVG projection 2.5D CSS transform tutorial` | [JointJS · Isometric diagrams using SVG](https://www.jointjs.com/blog/isometric-diagrams)：用 rotate(30)/skewX(-30)/scale(1,0.8602) 做等距投影；深度排序需要显式管理 |
| 5 | 视觉研究 | `exploded view UI design pattern architectural diagram interaction` | [Interactive Image-Based Exploded View Diagrams](https://m.zhangqiaokeyan.com/academic-conference-foreign_meeting-268879_thesis/0705012181840.html)：展开/收拢与遮挡关系要显式设计，不能靠自动布局猜 |
| 6 | 响应式 | `responsive isometric diagram mobile desktop SVG viewBox design` | 搜索结果普遍结论：固定 viewBox + `width:100%;height:auto`，小屏需允许横向滚动或重排；不把整张图压到不可读 |
| 7 | 可访问性 | `accessible interactive SVG diagram keyboard focus aria best practices` | 交互 SVG 元素需 `role=button`、`tabIndex=0`、Enter/Space、`:focus-visible`；装饰元素 `aria-hidden` |
| 8 | 性能 | `React SVG performance many elements memo virtualization` | [React memo](https://react.dev/reference/react/memo) + 稳定 props；大量 SVG 节点要减少重渲染/事件监听，必要时按 Stage 分组 |
| 9 | 同类产品 | 现有 Anatomy V2 实现（本仓库） | 已证明等距 SVG、确定性布局、键盘访问、NEW/UPD 痕迹、记录浏览可做；V3 复用这些能力 |

**未找到**：与 Mini Plane 当前构图直接对应的一手 GitHub Issue/PR/Discussion；因此不引用“某项目也这样做”的结论，只采用通用几何/可访问性/性能资料。六面中的 Issues/PR 面没有有效来源，已如实标注。

## 1. 可选技术方向

### 方向 A · React + SVG 等距投影，两套确定性布局（推荐）

- 复用 `geometry.project()`（30° 等距）与 `boxFaces()`；
- 成长视图：Stage 沿 z 轴垂直堆叠（旧在下、新在上），当前 Stage 用抬升/轮廓/索引高亮；
- 结构视图：Stage 沿 x 轴水平排开，少量 y 偏移制造层次；
- 两种视图共享同一 Stage/Task 身份与固定详情区；
- SVG `viewBox` 保证比例，移动端结构图允许横向滚动，不压缩到不可读。

**代价**：需要重新设计 `layout.ts` 的槽位/锚点；成长视图有遮挡问题，要用错位、透明边或前缘任务带解决。
**收益**：不引新库；可测试、可访问、与现有代码一致；视觉上能形成“整体工程对象”。

### 方向 B · CSS 3D transforms 拼装 HTML 层

用 `rotateX/rotateY/translateZ` 拼立方体。

**否决**：标签与点击区域在 3D transform 下更难命中；不同浏览器/缩放下线宽和文字会失真；不可测的布局更多。SVG 的 2.5D 已足够。

### 方向 C · Canvas / WebGL / Three.js

**否决**：新增依赖和体积；可访问性/文本选择/键盘路径需要另做一套；当前需求只是二维空间组织，不需要真实 3D 引擎。

## 2. 建议冻结的视觉语法

只使用一套“建筑构件”语言：

- 每个 Stage = 一块有厚度/顶面/立面的楼板（slab）；
- 每个 Task = 楼板上的小立方体/薄片；小尺寸时退化为平面方块；
- 选中 = 抬升 + 轮廓加粗 + 辅助线，不只换颜色；
- 当前 Stage = 索引高亮 + 顶面钴蓝描边；
- 未归属 Task = 独立的中性托盘（虚线轮廓），不伪装成 Stage；
- 不画 Task↔Task 依赖，不画“功能模块”猜测；
- 标签、编号、进度是工程图注记，不与图形抢中心。

## 3. 布局决策（待样稿确认）

| 视图 | 方向 | 排序 | 当前 Stage | 备注 |
|---|---|---|---|---|
| Growth | 垂直累积（z） | 旧 Stage 在下，新 Stage 在上 | 顶部/抬升 + 轮廓 | 不代表真实日期，不伪造“DAY 01→03” |
| Structure | 水平分离（x），少量 y 偏移 | Stage.order 从左到右 | 选中模块抬升/加粗 | 水平顺序只表达阶段顺序，不是依赖 |
| Detail | 固定右栏 | 跟随选中 Stage | — | 移动端下移为单栏 |

**稳定锚点**：Stage 的槽位只由 order 决定；新增 Stage 追加到末尾，旧 Stage 不重排。
**成长方向**：旧下新上，像建筑施工逐层加高；不按 Worklog 日期生成“历史楼层”。

## 4. 已知风险 / 待验证

1. **数据完整性**：生产图纸当前只取 `per_page=100` 的第一页 Task；>100 Task 会缺失（见 Phase 1 审计）。原型先用完整演示数据，生产接入前必须修。
2. **成长视图遮挡**：上层楼板会盖住下层任务；样稿要验证错位/前缘带/透明度的可读性。
3. **移动端可读性**：结构图横向展开在手机上会太小；样稿默认允许横向滚动，不强行缩放。
4. **标签密度**：Stage 名称/进度/任务数不能压过主图；小屏用索引/详情承载精确信息。
5. **动效**：只用 transform/opacity，尊重 `prefers-reduced-motion`；不做“历史长动画”。
6. **原型边界**：演示数据明确标注；不接 API、不改数据库、不替换生产组件。

## 5. Phase 2 原型验收清单

- [ ] Growth 视图远看是一个整体工程对象，不是卡片/模块网格；
- [ ] Structure 视图确实水平展开，上下错位受控；
- [ ] 两视图共享同一选中 Stage，切换不丢失；
- [ ] 点击 Stage / 键盘 Tab+Enter 都能选中；
- [ ] 详情区显示真实口径的 Stage 进度、任务总数、完成/进行中/待办数；
- [ ] 未归属任务可见且中性；
- [ ] 桌面三栏 + 移动端单栏/横向滚动可用；
- [ ] 明确标注“演示数据 / 不是历史回放”。

## 6. 参考实现清单

- 复用：`frontend/features/anatomy/model.ts`、`geometry.ts`、`changes.ts`、`history.ts`；
- 扩展：`state.ts` 增加 `view: growth|structure`，保留 `selectedStageId`；
- 重写：`layout.ts` 拆为 `layoutGrowth` / `layoutStructure`，共享 Stage/Task 身份；
- 重构：`AnatomyScene.tsx` 的模块原语与 `AnatomyPlate.tsx` 的三栏编排；
- 不接生产：原型独立 `docs/refactor/ui-design/anatomy/v3/prototype.html`。
