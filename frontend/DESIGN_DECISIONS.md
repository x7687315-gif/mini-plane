# DESIGN_DECISIONS.md — 设计决策日志

> 设计决策的来由与取舍。改任何决策前，先在这里记录原因。
> 配套：[DESIGN.md](./DESIGN.md)（设计系统）/ [SCREEN_BLUEPRINTS.md](./SCREEN_BLUEPRINTS.md)（屏幕蓝图）/ [FRONTEND_ROADMAP.md](./FRONTEND_ROADMAP.md)（开发路线）

| # | 决策 | 状态 | 日期 |
|---|------|------|------|
| D1 | 设计语言代号：**Blueprint Editorial（蓝图编辑风）** | ✅ 锁定 | 2026-09-16 |
| D2 | 字体：**Cormorant Garamond (装饰) + Inter (正文)** | ✅ 锁定 | 2026-09-16 |
| D3 | 底色：暖灰白 `#F4F1EA`（**不是**冷灰、不是纯白） | ✅ 锁定 | 2026-09-16 |
| D4 | 高亮色：钴蓝 `#1F3FA8`（**不是**饱和紫蓝、不是青色） | ✅ 锁定 | 2026-09-16 |
| D5 | 圆角克制：默认直角，仅头像/状态点/输入框可用 ≤ 4px 圆角 | ✅ 锁定 | 2026-09-16 |
| D6 | 网格底纹：32px 细网格，透明度 ≤ 30% | ✅ 锁定 | 2026-09-16 |
| D7 | 不引入组件库（shadcn / MUI / Ant Design） | ✅ 锁定 | 2026-09-16 |
| D8 | 不引入图标库（lucide / heroicons），全部自绘 inline SVG | ✅ 锁定 | 2026-09-16 |
| D9 | 不做暗色模式（第一期只一套亮色） | ✅ 锁定 | 2026-09-16 |
| D10 | Drawer 以路由形式实现（`?drawer=issue:uuid`） | ✅ 锁定 | 2026-09-16 |
| D11 | URL ↔ filter 双向同步 | ✅ 锁定 | 2026-09-16 |
| D12 | Issue 详情 100% 在 drawer 中渲染（**不**做独立详情页） | ✅ 锁定 | 2026-09-16 |
| D13 | 加载用骨架屏（**不**用 spinner / 菊花） | ✅ 锁定 | 2026-09-16 |
| D14 | 路由切换动画：从右滑入（180ms ease-out cubic-bezier） | ✅ 锁定 | 2026-09-16 |
| D15 | WebSocket 断线重连后**全量刷新当前列表**（事件只做"提示刷新"） | ✅ 锁定 | 2026-09-16 |
| D16 | 颜色 / 字体 / 圆角 / 阴影红线写进 ESLint 规则（机器守门） | 🟡 待 Sprint 0 落地 | — |

---

## D1 · 设计语言 = Blueprint Editorial

**背景**：参考图（用户提供的 3 张横向拼贴设计稿）是「建筑施工图 + 编辑杂志」混合气质 —— 极简、克制、装饰元素是制图语言而非「设计感」。

**决策**：代号 **Blueprint Editorial（蓝图编辑风）**。

**替代方案**（都被否决）：
- ❌ Linear 风（紫黑渐变）—— 太「AI 模板化」，饱和度太高
- ❌ Notion 风（暖米白 + 多色）—— 太「生活化」，没有「精确感」
- ❌ Vercel 风（纯黑白）—— 太冷，没有参考图那种「手绘感」
- ❌ 自创「涂鸦插画风」—— 与项目管理工具的「专业」气质冲突
- ✅ Blueprint Editorial：恰好平衡「专业」与「有温度」，与参考图气质一致

**理由**：
- 网格底纹 + 坐标轴 = 项目管理的「系统感」
- 衬线大写 + 罗马 italic = 编辑杂志的「克制美」
- 钴蓝细线 + 0.5px 边框 = 工程蓝图的「精度」
- 暖灰白底 = 不像「冷 SaaS」也不像「纯白医疗」

**风险**：第一期风格强烈可能让习惯于 Material / Tailwind UI 风的用户觉得「不像 SaaS」。但这正是我们想要的差异化。

## D2 · 字体 = Cormorant Garamond + Inter

**决策**：装饰位用 Cormorant Garamond Italic；正文 / UI 用 Inter。

**替代方案**：
- ❌ Inter + Inter（无衬线一体）—— 没有装饰性，参考图的 "R" "T" 大字无处着落
- ❌ Playfair Display + Inter —— Playfair 太古典、过度装饰；Cormorant 更克制、更适合工程蓝图的"克制美"
- ❌ Times New Roman（系统字体）—— 不同 OS 渲染不一致，不跨平台
- ✅ Cormorant Garamond + Inter —— 古典 + 现代的经典组合，Google Fonts 永久可用

**理由**：
- Cormorant Garamond 是「现代设计的古典字」—— 它的 italic 极其漂亮，比 Times New Roman 更精致
- Inter 是事实标准的现代 UI 字体 —— 屏幕渲染优秀、字符集全
- 都是 Google Fonts，**永久免费可用**，不会被 CDN 政策变化影响

**风险**：中文 fallback 走系统默认（PingFang SC / 思源黑体）；如果用户用罕用中文，会回退到默认字体。这不影响体验，因为中文只用在正文（用 Inter 即可），衬线大写永远是英文。

## D3 · 底色 = `#F4F1EA`（暖灰白）

**决策**：暖灰白 `#F4F1EA`，不是纯白、不是冷白、不是浅米黄。

**替代方案**：
- ❌ `#FFFFFF`（纯白）—— 太刺眼、没有温度
- ❌ `#FAFAFA`（冷灰白）—— 显得「无菌」、缺少「手绘感」
- ❌ `#FFF8E7`（米黄）—— 像「老旧纸张」、与工具的现代感冲突
- ✅ `#F4F1EA`（暖灰白）—— 接近参考图的那种"哑光纸"质感，不刺眼又有温度

**理由**：
- 参考图整体是低饱和的暖调；纯白会让"网格底纹"消失（对比度不够）
- 暖灰白让衬线 italic 大字显得"被印在纸上"，而不是"浮在屏幕上"

**风险**：在 OLED 屏幕上看起来偏暗。这是设计取舍（克制 > 刺眼）。

## D4 · 高亮色 = `#1F3FA8`（钴蓝）

**决策**：钴蓝 `#1F3FA8`，**不是**饱和紫蓝、不是青色、不是亮蓝。

**替代方案**：
- ❌ `#3B82F6`（Tailwind blue-500）—— 太亮、太"AI 默认色"
- ❌ `#6366F1`（indigo-500）—— 太紫、"Linear 风"
- ❌ `#0EA5E9`（sky-500）—— 太青、与参考图的蓝不一致
- ✅ `#1F3FA8`（钴蓝）—— 接近参考图里的"工程蓝/制图蓝"，饱和度低、偏冷中带紫

**理由**：
- 参考图里的蓝是「钢笔蓝」「CAD 蓝」—— 接近国际 Klein Blue 但饱和度低
- 钴蓝既有"工程感"又有"克制美"，不抢戏
- 蓝色不像红色那样让人焦虑，适合长时间使用的项目管理工具

**风险**：在已有蓝色 logo / 品牌色的情况下冲突（如有客户要换品牌色）。第一期固定这个蓝，二期再讨论品牌色。

## D5 · 圆角克制（默认直角）

**决策**：默认直角（0），仅头像（pill）/ 状态点（pill）/ 输入框（2px）/ 按钮（4px）有小圆角。

**替代方案**：
- ❌ Material Design 默认 4-8px 圆角 —— 太"通用模板"
- ❌ 8-12px 大圆角 —— 像消费类 App，不像工程工具
- ✅ 直角为主 —— 与参考图的"硬朗构图"一致

**理由**：
- 直角 = 精确 / 克制 / 工业感
- 大圆角 = 友好 / 消费 / 现代
- 项目管理是工业工具，需要"精确感"

**风险**：少部分用户觉得"不像 2026 年的 UI"。但差异化就是差异化。

## D6 · 32px 网格底纹（透明度 ≤ 30%）

**决策**：全站背景叠 32px × 32px 细网格，线色 `#D9D4C2`，透明度 ≤ 30%。

**理由**：
- 参考图有大量"网格"元素，是核心视觉符号
- 32px 是 8 的倍数，符合 DESIGN.md §3.2 间距尺度
- 透明度低 = 不抢戏，只在"留意时"才看到

**风险**：
- 暗色模式下网格线颜色需要重选（当前不启用暗色，但二期要预备方案）
- 在 4K 屏上 32px 可能太密，但这是长期问题，第一期不处理

## D7 · 不引入组件库

**决策**：不引入 shadcn / MUI / Ant Design / Chakra / Radix UI 等组件库。

**理由**：
- 我们的设计语言高度定制化（衬线大写、十字标记、坐标轴装饰、网格底纹）
- 任何组件库的默认样式都会与 DESIGN.md 冲突，需要大面积覆盖（`!important`）
- 覆盖 = 二次维护，不如自己写
- 14 个核心组件（Button/Chip/Card/Input/Avatar/...）工作量可控

**风险**：
- 团队不熟悉的设计决策（无组件库=全部自己写）的代价
- 可访问性（a11y）需要自己保证（焦点管理、ARIA、键盘导航）

**对策**：
- 写组件时严格遵循 WAI-ARIA Authoring Practices
- 关键组件（Modal、Drawer、Menu）做单元测试 + 键盘导航 e2e

## D8 · 自绘 inline SVG 图标

**决策**：所有图标自绘 inline SVG（16px，stroke 1.5px，round caps/joins，currentColor）。

**替代方案**：
- ❌ lucide-react —— 自带 1.5px stroke，但风格偏"几何"，与衬线 italic 不搭
- ❌ heroicons —— 类似问题
- ❌ emoji —— 跨平台不一致，且与"克制"风格冲突
- ✅ 自绘 —— 完全控制线条粗细、端点形状、与衬线 italic 视觉协调

**理由**：
- 图标是设计语言的延伸，自绘才能保证风格统一
- SVG 文件小、可 tree-shake
- 可被 currentColor 继承，自动适配深浅主题（二期需要时）

**风险**：前期工作量较大（约 14 个图标，每个 5–10 分钟）

## D9 · 不做暗色模式（第一期）

**决策**：第一期只做亮色模式。

**理由**：
- 暗色模式需要重新调色（颜色对比度、网格线颜色、装饰元素颜色）
- 第一期项目量已经很大（前端 8 个 Sprint + 后端 8 个 Sprint）
- 暖灰白 + 钴蓝 的设计在亮色下已经够好，**没有用户会因暗色缺失而流失**

**二期预备**：
- DESIGN.md §1 已用 CSS variables 抽象颜色，切换主题只需换 variables 值
- 但当前 components 还没写 `[data-theme="dark"]` 选择器，二期再补

## D10 · Drawer = 路由形式

**决策**：Issue 详情用 drawer 形式，通过 URL `?drawer=issue:uuid` 触发。

**替代方案**：
- ❌ 弹窗（modal）—— modal 阻挡列表，无法"边看边编辑"
- ❌ 独立详情页 `/issues/:iid` —— 跳跳跳，参考图暗示的"横向滑动"无法实现
- ✅ Drawer + 路由 —— 既能"边看边编辑"，又能刷新保留 / 分享链接

**理由**：
- 与参考图的「横向滑动」交互一致
- URL 可分享、可刷新
- 关闭 drawer = 仅修改 query 参数，**不重渲染列表**（性能好）

**风险**：URL 会变长（`?drawer=issue:uuid`）。这是取舍。

## D11 · URL ↔ filter 双向同步

**决策**：所有列表 filter（state / priority / labels / assignee / search / ordering / page / per_page）都同步到 URL。

**理由**：
- 刷新保留筛选
- 链接可分享（"帮我看下 priority=urgent 的 issue"）
- 浏览器前进 / 后退工作正常
- 用户可以通过改 URL 直接尝试参数（无 Apply 按钮）

**实现**：
- `useFiltersFromUrl()`：从 URL 解析 filter state
- `useFiltersToUrl()`：filter state 变化后 push 新 URL（debounce 100ms）
- React Query 的 queryKey 包含 filter state，自动重新请求

**风险**：URL 变化频繁会污染浏览器历史。使用 `replaceState`（非 `pushState`）解决。

## D12 · Issue 详情 100% drawer 化（不做独立详情页）

**决策**：Issue 详情只在 drawer 内渲染。

**理由**：
- 项目管理场景下，"上下文"是关键 —— 用户要看到 issue 是在哪个项目里、什么列表过滤下
- 跳独立详情页 = 上下文丢失 = 用户迷路
- drawer 让用户始终保持对列表的感知

**实现**：虽然路由是 `/w/:slug/projects/:pid/issues/:iid`，但实际渲染时 `page.tsx` 检测到该路径 → 直接重定向到 `/w/:slug/projects/:pid?drawer=issue:iid`。

## D13 · 加载用骨架屏

**决策**：所有首屏加载用骨架屏（行 × N），**不用** spinner / 菊花 / loading 文字。

**理由**：
- 骨架屏 = 用户感知到"内容会在这里出现"，比 spinner 更友好
- 与"克制"风格一致（spinner 圆圈在 Blueprint Editorial 里太"通用"）

**风险**：骨架屏开发成本高于一个 spinner。但写一次复用很多次。

## D14 · 路由切换 = 从右滑入

**决策**：进子路由时，新页面从右滑入（translateX(16px) → 0 + opacity 0→1，180ms）。

**理由**：参考图暗示"从左到右"的视觉变换。

**实现**：Next.js App Router + framer-motion 的 `<AnimatePresence>`。

**风险**：动画在低端设备上可能掉帧。180ms 已是保守值，且只动 transform / opacity。

## D15 · WS 重连后全量刷新兜底

**决策**：WebSocket 重连成功后，**不**回放断线期间的事件，而是触发 React Query 的 `invalidateQueries` 全量刷新当前页。

**理由**（与后端契约 [08-realtime.md](../../docs/api/08-realtime.md) §2.3 一致）：
- 事件 payload 不含完整对象，只含 diff
- 全量刷新保证一致性
- 实现简单（不需要"事件队列"）

**风险**：高频操作时（如批量改 50 个 issue）会有大量无效请求。但 WS 已经声明"事件只做提示"。

## D16 · 关键设计规则写进 ESLint

**状态**：🟡 Sprint 0 落地。

**计划**：
- `no-restricted-syntax` 禁止 `<div style={{ ... }}>` 大量内联样式（强制用 Tailwind class 或 CSS variables）
- `no-restricted-imports` 禁止引入 lucide-react / @heroicons/* / antd / @mui/* / @chakra-ui/*
- 自定义规则（`eslint-plugin-local-rules`）：禁止使用 hex 颜色（必须用 `--color-*` token）

**理由**：机器守门 > 文档守门 > Code Review 守门。