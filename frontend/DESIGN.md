# DESIGN.md — Mini Plane Design System

> 设计语言代号：**Blueprint Editorial（蓝图编辑风）**
> 状态：v0.1 — 初稿，与 [FRONTEND_ROADMAP.md](./FRONTEND_ROADMAP.md) Sprint 0 同步冻结
> 后续变更请通过 PR 修改本文件并在 [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) 留痕

## 0. 设计哲学

项目管理不是「管理任务」，而是「绘制一张精确的建筑施工图」。

我们的隐喻是 **一张正在被绘制的图纸**：

- 工作区 = 一摞图纸
- 项目 = 一张完整的施工图
- Issue = 图纸上的标记
- 评论 = 图纸上的批注
- 活动流 = 图纸上的修订痕迹

界面因此必须像 **工程蓝图 + 编辑杂志** 的混合：克制、精确、留白是克制、装饰是制图语言而不是「设计感」。

**绝不**：渐变、模糊、阴影堆叠、毛玻璃、霓虹点缀、圆角 + 阴影的「卡片套卡片」组合、AI 配色（青紫渐变）。

**必须**：细线（0.5px）、网格底纹、衬线大写、坐标轴感、尺寸标注、坐标 ID（AMI-7 / sheet 03 / 12）、克制的高亮色（钴蓝）。

---

## 1. 调色板

### 1.1 纸面与墨色（Primary Neutrals）

| Token | Hex | 用途 |
|-------|-----|------|
| `--color-paper` | `#F4F1EA` | 页面背景（暖灰白底色 — 不是纯白） |
| `--color-paper-2` | `#EBE7DD` | 二级面板 / 输入框背景 / 分割区 |
| `--color-paper-3` | `#D9D4C2` | 网格底纹线 / 占位符 |
| `--color-ink` | `#1B1A17` | 主文字 / 主按钮 |
| `--color-ink-2` | `#5A5851` | 次级文字 / label |
| `--color-ink-3` | `#8C887E` | 三级文字 / hint / placeholder |
| `--color-rule` | `#C8C3B4` | 边框（默认 0.5px） |

### 1.2 高亮色（Engineering Blue）

| Token | Hex | 用途 |
|-------|-----|------|
| `--color-accent` | `#1F3FA8` | 主高亮 / 选中态 / 当前行左标 / 链接 |
| `--color-accent-2` | `#4F6FD6` | 二级高亮 / hover / 描边态 |
| `--color-accent-soft` | `#E2E7F5` | 高亮底色（激活项背景、激活态描边区域） |

> **为什么是钴蓝不是紫蓝**：参考图里的蓝是「工程蓝」/「制图蓝」（像钢笔蓝、CAD 蓝），饱和度低、偏冷中带紫。我们拒绝饱和度高的纯蓝（接近 60% 饱和度的 cobalt blue 会立刻显得「UI 模板化」）。

### 1.3 状态色（State Colors）

| Token | Hex | 含义 |
|-------|-----|------|
| `--color-urgent` | `#dc2626` | priority=urgent / 错误 |
| `--color-high` | `#f97316` | priority=high |
| `--color-medium` | `#eab308` | priority=medium |
| `--color-low` | `#3b82f6` | priority=low |
| `--color-none` | `#94a3b8` | priority=none / 占位 |
| `--color-success` | `#10b981` | 成功反馈 |
| `--color-warning` | `#a8551f` | 警告（暖橙，区别于 priority high） |

> 状态色只用于 **传达语义**，不用于装饰。每个色都必须能 1:1 对应到一个具体含义。

### 1.4 不可用色

以下颜色 **不得** 在本项目 UI 中出现：

- 纯黑 `#000000`（用 `--color-ink` 替代）
- 纯白 `#ffffff`（用 `--color-paper` 替代）
- 任何饱和度 ≥ 70% 的紫色 / 粉紫（避免「AI 配色」）
- 渐变色（除极个别 KPI 大数字用一次性 ink→accent 的极弱渐变；不超过 2 处）
- 发光 / 霓虹效果

---

## 2. 字体系统

### 2.1 字体来源

| 用途 | 字体 | 加载方式 |
|------|------|---------|
| 装饰大写 / Logo / 编号 / 标签 | **Cormorant Garamond**（Italic） | Google Fonts |
| 正文 / UI / 表格 | **Inter** | Google Fonts |
| 等宽（trace ID、commit hash） | **JetBrains Mono**（可选） | Google Fonts |

字体导入（在 app/layout.tsx）：

```ts
import { Cormorant_Garamond, Inter } from "next/font/google";

const serif = Cormorant_Garamond({
  subsets: ["latin"], weight: ["400", "500", "600"],
  style: ["italic", "normal"], variable: "--font-serif",
});

const sans = Inter({
  subsets: ["latin"], weight: ["400", "500"],
  variable: "--font-sans",
});
```

### 2.2 字体尺度（Type Scale）

| Token | Size / Weight / Style | 用途 |
|-------|----------------------|------|
| `--text-display` | 48px / 500 / Cormorant italic | 页面 Hero（极少用，如 Login 标题） |
| `--text-title` | 30px / 500 / Cormorant italic | 页面主标题（Issues / Workspaces） |
| `--text-section` | 20px / 500 / Cormorant italic | 区块标题（drawer 标题） |
| `--text-id` | 13px / 400 italic / Cormorant | 编号 / ID 标签（AMI-7、sheet 03/12） |
| `--text-body` | 13px / 400 / Inter | 正文 |
| `--text-body-strong` | 13px / 500 / Inter | 强调正文 |
| `--text-meta` | 11px / 400 / Inter | 元信息（label、tag） |
| `--text-uppercase` | 10px / 500 / Inter / 0.18em letter-spacing | 全大写小标签（STATE / PRIORITY / FIG·01） |
| `--text-hint` | 9px / 400 / Inter / 0.24em letter-spacing | 极小提示（坐标、尺寸） |

### 2.3 字体规则

- **永远 sentence case**（句首大写，句中小写），绝不 Title Case、绝不 ALL CAPS（除了 `.text-uppercase` 这种特定 token）
- 衬线 **只在装饰位** 用（Logo / 编号 / Hero / 标签），正文必须是 Inter
- 中文字体走系统默认（PingFang SC / 思源黑体）；不主动引入中文衬线（会破坏「蓝图编辑风」的克制感）
- 字体粗细只有两档：400 / 500，绝不 600/700

---

## 3. 布局系统

### 3.1 网格底纹（Blueprint Grid）

页面背景叠一层 32px × 32px 的细网格：

```css
background-image:
  linear-gradient(to right, transparent 0, transparent calc(100% - 1px), var(--color-paper-3) calc(100% - 1px)),
  linear-gradient(to bottom, transparent 0, transparent calc(100% - 1px), var(--color-paper-3) calc(100% - 1px));
background-size: 32px 32px, 32px 32px;
```

- 网格线透明度 **始终 ≤ 30%**（不能抢戏）
- **绝对不**在页面中间打断网格；只有「重要装饰」（如 Issue 详情大卡片）才能撑破网格
- 暗色主题同样保留网格（线条颜色换成 `--color-ink-3` 透明度 15%）

### 3.2 间距尺度（Spacing Scale）

| Token | Value | 典型用途 |
|-------|-------|---------|
| `--space-1` | 4px | 图标与文字间隙 |
| `--space-2` | 8px | chip 内边距 / 紧凑行高 |
| `--space-3` | 12px | 卡片内边距 |
| `--space-4` | 16px | 区块内边距 |
| `--space-5` | 24px | 大区块间距 |
| `--space-6` | 32px | 页面区块间距 |
| `--space-7` | 48px | 页面大节奏 |
| `--space-8` | 64px | 顶级留白 |

间距系统是 **2 的幂近似 + 黄金分割**：4 / 8 / 12 / 16 / 24 / 32 / 48 / 64。**不引入** 5/7/13/20 这些「不齐整」的值。

### 3.3 边框与圆角

| Token | Value | 用途 |
|-------|-------|------|
| `--border-default` | `0.5px solid var(--color-rule)` | 默认边框 |
| `--border-strong` | `0.5px solid var(--color-ink-2)` | 强调边框（hover） |
| `--border-accent` | `0.5px solid var(--color-accent)` | 激活态边框 |
| `--radius-none` | `0` | 默认（绝大多数元素都是直角） |
| `--radius-sm` | `2px` | 输入框 / 标签 |
| `--radius-md` | `4px` | 按钮 |
| `--radius-pill` | `999px` | 头像 / 状态点外圈 |

> **圆角克制**：绝大多数元素是直角（参考图全是大尖角 + 直角构图），只有头像、状态点、输入框可以用小圆角。**绝不**用 12px+ 大圆角。

### 3.4 布局栅格

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar · 56px fixed                                         │
├──────────┬──────────────────────────────────┬───────────────┤
│          │                                  │               │
│ LeftRail │ Main                             │ Aside         │
│ 96px     │ flex 1                           │ 168px         │
│          │                                  │               │
│ Workspace│  PageHeader                      │ Throughput    │
│ Switcher │  Filters                         │ Cycle time    │
│          │  List / Board                    │ Ledger        │
│ (sticky) │                                  │ (sticky)      │
│          │                                  │               │
├──────────┴──────────────────────────────────┴───────────────┤
│ Footer · 28px (REV / N·W 坐标 / covenant)                  │
└─────────────────────────────────────────────────────────────┘
```

- **TopBar**：56px fixed，含 Logo + 当前路径 + 当前用户
- **LeftRail**：96px 宽，左侧 workspace 切换（缩略字母 + 当前 role 角标）
- **Main**：弹性宽度，最小 640px
- **Aside**：168px 宽，右侧 KPI / ledger（不强制出现，窄屏可隐藏）
- **Footer**：28px 固定底部，3 列布局（坐标 / covenant / 版本）

> 三栏比例 **96 : flex : 168** ≈ **1 : 6 : 2**，留 Main 充足空间。

---

## 4. 组件库规格

### 4.1 按钮（Button）

```tsx
<Button variant="primary" size="sm">Create issue</Button>
<Button variant="secondary" size="sm">Cancel</Button>
<Button variant="ghost" size="sm">⋯</Button>
```

| Variant | Style |
|---------|-------|
| `primary` | bg `--color-ink` / text `--color-paper` / border none |
| `secondary` | bg transparent / text `--color-ink` / border `0.5px --color-rule` |
| `ghost` | bg transparent / text `--color-ink-2` / border none / hover text `--color-ink` |
| `accent` | bg transparent / text `--color-accent` / border `0.5px --color-accent` |

- 字号：11px Inter / 0.16em letter-spacing / UPPERCASE
- 内边距：`6px 12px`
- 圆角：4px
- 状态：hover 加深边框色；active 加 `--color-accent` 边框；disabled opacity 0.4

### 4.2 Chip / Filter

```tsx
<Chip active>Backlog · 42</Chip>
<Chip accent>Todo</Chip>
```

- 默认态：transparent bg / `--color-ink-2` text / `--color-rule` border
- `active`：bg `--color-ink` / text `--color-paper` / border `--color-ink`
- `accent`：text & border `--color-accent` / bg transparent
- 字号：10px / 0.14em letter-spacing / UPPERCASE
- 内边距：`5px 10px`

### 4.3 Card

> **绝不**用「圆角 + 阴影」的卡片组合。
>
> 卡片 = 直角 + 0.5px 边框 + 1.25rem 内边距 + 白色背景（用 `--color-paper-2` 微差）

```tsx
<Card>
  <CardHeader>{title}</CardHeader>
  <CardBody>{children}</CardBody>
</Card>
```

- 背景：white（`--color-paper`）
- 边框：`0.5px solid var(--color-rule)`
- 内边距：`16px 20px`
- 圆角：0（直角）
- 阴影：**无**（最多功能性 focus ring 1px `--color-accent`）

### 4.4 Input / Textarea

- 边框：`0.5px solid var(--color-rule)`
- 内边距：`6px 10px`
- 字号：13px Inter
- 焦点：border 变 `--color-accent`
- 占位符：italic + `--color-ink-3`

### 4.5 Avatar

```tsx
<Avatar user={user} size="sm" />  // 24px
<Avatar user={user} size="md" />  // 36px
```

- 背景：`--color-paper-2`
- 文字：Cormorant italic / 首字母
- 边框：`0.5px solid var(--color-rule)`
- 圆形（pill radius）

### 4.6 Issue ID（核心组件）

```tsx
<IssueId project="AMI" sequence={7} />
// renders: AMI-07 (italic Cormorant, 14px, accent color)
```

- 永远 italic Cormorant
- 永远 accent 颜色
- 字号 14px / letter-spacing 0.05em

### 4.7 Priority Dot

```tsx
<PriorityDot value="urgent" />  // 8px square rotated 45deg
<PriorityDot value="none" />    // hollow
```

- 形状：8×8 方块，旋转 45°
- 颜色：见 §1.3 状态色
- `none`：透明填充 + `--color-none` 边框

### 4.8 Drawer（侧拉详情）

> Issue 详情用从右侧滑入的抽屉（参考图暗示「横向滑动」的交互）

- 宽度：`min(640px, 90vw)`
- 高度：100vh
- 动画：transform translateX(100%) → 0，250ms `cubic-bezier(0.2, 0.8, 0.2, 1)`
- 遮罩：bg `--color-ink` opacity 0.3 + backdrop-filter blur(2px)
- 关闭：× 按钮 / Esc / 点击遮罩（带二次确认如有未保存评论）

### 4.9 Tab

```tsx
<Tab active>Activity <em>06</em></Tab>
```

- 字号：10px UPPERCASE / 0.2em letter-spacing
- 默认：text `--color-ink-3`
- 激活：text `--color-ink` + border-bottom 1px `--color-accent`
- 数字徽章：italic Cormorant / `--color-accent`

### 4.10 Crosshair 十字标记

> 装饰元素，参考图标志性的元素。用在 rail 底部、空白区角部。

```tsx
<Crosshair label="00° N · 00° E" />
```

- 18×18 方形 + 十字线（0.5px `--color-accent`）
- 可选 label（9px 衬线 italic）

### 4.11 Activity Item

> 时间线渲染，复用 §6 活动文案映射表

```tsx
<ActivityItem activity={activity} />
```

- 时间：italic Cormorant / 10px / `--color-ink-3`（左侧时间戳）
- 主体：`<b>{actor}</b> + 文案模板`
- 字段 pill：inline 块 + 0.5px border + italic Cormorant 11px

### 4.12 Label Tag

```tsx
<LabelTag label={{ name: 'bug', color: '#dc2626' }} />
```

- 字号：9px UPPERCASE
- 左侧：6×6 颜色方块
- 边框：`0.5px solid var(--color-rule)`

---

## 5. 状态系统

每个交互组件必须实现以下状态：

| 状态 | 视觉 |
|------|------|
| default | 边框 `--color-rule`，无背景或 `--color-paper-2` |
| hover | 边框 `--color-ink-2` 或文字色变 `--color-ink` |
| focus | 边框 `--color-accent` + 1px 外发光（无模糊） |
| active | bg `--color-ink` 或 border `--color-accent` |
| disabled | opacity 0.4 + cursor not-allowed |
| loading | 骨架屏（细线 + `--color-paper-2` 闪烁，**无 spinner**） |
| error | 边框 `--color-urgent` + 字段下方红色提示文案 |
| empty | 网格背景 + 「FIG · EMPTY ·」文字（参考图空状态） |

---

## 6. 动效原则

### 6.1 动画基础

| 维度 | 规则 |
|------|------|
| 时长 | 150–250ms（极短） |
| 缓动 | `cubic-bezier(0.2, 0.8, 0.2, 1)` （ease-out 感） |
| 距离 | ≤ 8px 位移 / 0.01 scale（极轻） |
| 属性 | **只动 transform 和 opacity**（不动画 width/height/margin） |

### 6.2 路由切换

- 进：从右往左滑入（`translateX(16px) → 0`） + 透明度 0 → 1
- 出：从左往右滑出
- 时长：180ms

### 6.3 Drawer / Modal

- Drawer：从右滑入（`translateX(100%) → 0`）+ 遮罩淡入
- 时长：250ms

### 6.4 Issue 行操作反馈

- 改状态成功：行的 accent left bar 闪一下（200ms）
- 改优先级：dot 颜色 cross-fade
- 新评论：从下方滑入（`translateY(8px) → 0`）

### 6.5 不要的动效

- ❌ 弹性/弹跳缓动（`bounce`、`back`）
- ❌ 长动画（> 400ms）
- ❌ 大位移（> 16px）
- ❌ 旋转 / 翻转
- ❌ Loading spinner（用骨架屏）

---

## 7. 响应式策略

### 7.1 断点

| Breakpoint | Width | 行为 |
|------------|-------|------|
| `mobile` | < 640px | Aside 隐藏，LeftRail 收为顶部抽屉，Main 单列 |
| `tablet` | 640–1024px | Aside 隐藏，LeftRail 96px 保留 |
| `desktop` | ≥ 1024px | 三栏完整布局 |
| `wide` | ≥ 1440px | Main 居中最大 1280px |

### 7.2 容器查询

> 抽屉（drawer）内部用容器查询 `@container (min-width: 480px)` 决定元信息横排还是竖排。

### 7.3 触摸目标

- 所有可点击元素 ≥ 36px（**不是** 44px，因为「蓝图编辑风」讲究紧凑）
- 表格行高 ≥ 40px
- Drawer 关闭按钮 ≥ 24px（在桌面端是可接受的）

---

## 8. 文字 / UX 文案

### 8.1 文案规则

- **永远 sentence case**
- 中文界面为主，专有名词（如 "Issue"、"Priority"、"Backlog"）保留英文
- 按钮文案要动词化：`Create issue` / `Save changes` / `Send invite`
- 错误文案要说明 **怎么办**，不只是 **出了什么问题**：
  - ❌ `请求失败`
  - ✅ `请求失败（403）· 你是 Viewer 角色，不能创建 Issue`

### 8.2 装饰文案

参考图里的 "GLANCE"、"SHRINE"、"AT"、"COVENANT" 单词散布。我们对应使用：

| 场景 | 装饰词 |
|------|--------|
| Footer 中部 | `covenant · between user and system` |
| TopBar 副标题 | `mini · sheet N / 12` |
| Footer 右部 | `REV · 0.1 · DRIFT 0.0` |
| Footer 左部 | `N · 31° 14′ · W · 121° 28′` |
| Filter 行 | `FIG · 01 · AMI · ACTIVE` |
| Drawer header | `AMI / WORK ITEM · AMI-07 · OPENED IN DRAWER` |

> 这些装饰词是 **统一一套**，不能临时改字；改字要更新 DESIGN.md。

### 8.3 活动文案（前端拼句子用，与 [docs/api/06-activities.md](../../docs/api/06-activities.md) 同步）

| entity_type | action | 模板 |
|-------------|--------|------|
| `issue` | `created` | `{actor} 创建了任务` |
| `issue` | `updated` | `{actor} {fields}`（fields = "将 X 从 A 改为 B" 列表） |
| `issue` | `deleted` | `{actor} 删除了任务` |
| `comment` | `created` | `{actor} 评论了任务` |
| `comment` | `deleted` | `{actor} 删除了评论` |
| `project` | `created` | `{actor} 创建了项目` |
| `project` | `updated` | `{actor} 将 {field} 从 {old} 改为 {new}` |

字段中文名映射：`title→标题` / `description→描述` / `state→状态` / `priority→优先级` / `assignee→指派人` / `labels→标签` / `name→项目名称` / `identifier→项目标识`。

`assignee` 为 `null` 时显示 **未指派**。

---

## 9. 加载 / 错误 / 空状态

### 9.1 Loading

- **骨架屏**：用 `--color-paper-2` 矩形 + 偶尔闪烁
- **不**用 spinner、菊花、loading 文字
- Issue 列表加载：行骨架，每行 5 列

### 9.2 Empty

- 中央对齐
- 一行衬线 italic 文案：`No issues · Backlog is empty`
- 下方一个 secondary 按钮：`+ Create your first issue`
- **保留**网格底纹 + 十字标记装饰

### 9.3 Error

- Inline error：边框变 `--color-urgent` + 字段下方文案
- 全局 error：顶部细线 banner，红色，文案简短
- 401：自动跳登录页（带 redirect 参数）
- 403：提示文案 + 「申请权限」按钮（WS Member 可以申请加入新 Workspace）
- 404：直接按不存在处理（不重试），**不**显示「资源不存在」的弹窗

---

## 10. 不要做（红线）

> 这一节是 hard constraint。任何违反都要先讨论再改。

| ❌ 不要 | 原因 |
|--------|------|
| 渐变 / 模糊 / 毛玻璃 | 破坏「蓝图」克制感 |
| 大圆角（> 4px 用于普通元素） | 破坏直角构图 |
| 阴影堆叠（多层 box-shadow） | 不是「设计感」是廉价感 |
| emoji / 图标字体（icon font） | 用 inline SVG 自绘极简单线条图标 |
| 任何动效 > 400ms | 慢 |
| ALL CAPS 装饰文字（除了 `text-uppercase` token） | 阅读困难 |
| 字体粗细 600/700/800 | 视觉噪音 |
| 主题切换（多套色） | 蓝图编辑风只有一套 |
| 任何形式的暗色模式 | 第一期只有亮色；二期再议 |
| 浮动提示（tooltip on hover） | 用页内说明或空文字代替 |
| 全局 loading overlay | 用骨架屏 |

---

## 11. 资产

> 本项目 **不引入任何** 第三方图片、图标包、插画库。
>
> 所有视觉元素都是：
> - 文字（衬线 italic）
> - 几何形状（CSS / SVG）
> - CSS 网格
> - 极简单线条 SVG 图标（自绘，stroke 1.5px）

### 11.1 必须自绘的 SVG 图标清单

| 图标 | 用途 |
|------|------|
| search | 搜索框 |
| plus | 创建按钮 |
| x | 关闭按钮 / 删除 |
| chevron-down | 下拉 |
| chevron-up | 上拉 |
| chevron-left / -right | 分页 / 路由切换 |
| arrow-right | 提交动作 |
| circle | 状态点（颜色填充） |
| square (rotated 45°) | priority 标记 |
| grid | 视图切换 |
| list | 视图切换 |
| filter | 筛选 |
| sort | 排序 |
| user | 用户 |
| settings | 设置 |
| logout | 登出 |

> 图标统一 16px / stroke 1.5px / round caps / round joins / currentColor。

---

## 12. Agent Prompt Guide（给后续 AI 用）

如果后续 AI agent 要为本项目生成 UI 代码，必须先读本 DESIGN.md，并遵守：

```
你是 Mini Plane 的 UI 实现 agent。
- 颜色用 §1 token，不许自造颜色
- 字体用 Cormorant Garamond（装饰）+ Inter（正文）
- 背景永远带 §3.1 网格底纹
- 直角为主，圆角 ≤ 4px
- 边框 0.5px，不用阴影
- 动效 150–250ms，ease-out cubic-bezier(0.2, 0.8, 0.2, 1)
- 错误状态：边框 --color-urgent，不许用大红色 alert 弹窗
- 加载用骨架屏，不许用 spinner
- 所有图标自绘 inline SVG，不许用 emoji / icon font / 第三方图标库
- 永远 sentence case
```

详细规则见本文 §1–§11。

---

## 附录 A：Tailwind Config 起点

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "var(--color-paper)",
        "paper-2": "var(--color-paper-2)",
        "paper-3": "var(--color-paper-3)",
        ink: "var(--color-ink)",
        "ink-2": "var(--color-ink-2)",
        "ink-3": "var(--color-ink-3)",
        rule: "var(--color-rule)",
        accent: "var(--color-accent)",
        "accent-2": "var(--color-accent-2)",
        "accent-soft": "var(--color-accent-soft)",
        urgent: "var(--color-urgent)",
        high: "var(--color-high)",
        medium: "var(--color-medium)",
        low: "var(--color-low)",
        none: "var(--color-none)",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        display: ["48px", { lineHeight: "1.1" }],
        title: ["30px", { lineHeight: "1.15" }],
        section: ["20px", { lineHeight: "1.2" }],
        body: ["13px", { lineHeight: "1.55" }],
        meta: ["11px", { lineHeight: "1.4" }],
        uppercase: ["10px", { letterSpacing: "0.18em", lineHeight: "1.3" }],
        hint: ["9px", { letterSpacing: "0.24em", lineHeight: "1.3" }],
      },
      borderRadius: {
        none: "0",
        sm: "2px",
        md: "4px",
        pill: "999px",
      },
      borderWidth: {
        DEFAULT: "0.5px",
      },
    },
  },
} satisfies Config;
```

## 附录 B：CSS Variables 起点

```css
/* app/globals.css */
:root {
  --color-paper: #F4F1EA;
  --color-paper-2: #EBE7DD;
  --color-paper-3: #D9D4C2;
  --color-ink: #1B1A17;
  --color-ink-2: #5A5851;
  --color-ink-3: #8C887E;
  --color-rule: #C8C3B4;
  --color-accent: #1F3FA8;
  --color-accent-2: #4F6FD6;
  --color-accent-soft: #E2E7F5;
  --color-urgent: #dc2626;
  --color-high: #f97316;
  --color-medium: #eab308;
  --color-low: #3b82f6;
  --color-none: #94a3b8;
  --color-success: #10b981;
  --color-warning: #a8551f;

  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;

  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
}

html, body {
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-sans), system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.55;
}

body {
  background-image:
    linear-gradient(to right, transparent 0, transparent calc(100% - 1px), var(--color-paper-3) calc(100% - 1px)),
    linear-gradient(to bottom, transparent 0, transparent calc(100% - 1px), var(--color-paper-3) calc(100% - 1px));
  background-size: 32px 32px, 32px 32px;
}
```