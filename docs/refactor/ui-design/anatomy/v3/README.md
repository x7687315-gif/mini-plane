# Anatomy V3 · 生长视图 / 结构视图

> 状态：**Phase 1 审计 + Phase 2 独立高保真原型完成，等待用户确认；生产代码未改。**
> 分支：`feat/anatomy-v3` · 日期：2026-10-28

## 先看什么

1. [高保真原型](prototype.html) —— 直接用浏览器打开；桌面/手机都可看。
2. [Phase 1 现状审查](PHASE1_AUDIT.md) —— 哪些复用、哪些重构、发现的数据完整性问题。
3. [技术 Preflight](PREFLIGHT.md) —— 检索台账、技术路线与已知坑。
4. [Phase 2 原型记录](PHASE2_PROTOTYPE.md) —— 设计决策、验证结果、待确认点。

## 原型截图

| 生长视图（桌面） | 结构视图（桌面） |
|---|---|
| ![growth](prototype-growth.png) | ![structure](prototype-structure.png) |
| **生长视图（390px）** | **结构视图（390px）** |
| ![mobile growth](prototype-mobile-growth.png) | ![mobile structure](prototype-mobile-structure.png) |

## 当前边界

- 原型使用演示数据，不连接 API、不改数据库、不替换 `AnatomyPlate`；
- 不做 Task 依赖箭头，不生成按日历史回放；
- 生产接入前需要先解决 >100 Task 分页导致的构件缺失（见 Phase 1 审计 §2.2）；
- 生产接入顺序：布局纯函数 → 双视图状态 → SVG 原语 → 详情/索引 → 真实数据边界 → 测试/文档。

## 下一步（待确认）

用户先确认空间方向（旧下新上、结构整体感、Task 表达、移动端策略、详情密度）；
确认后进入 Phase 3，不直接改生产页面。
