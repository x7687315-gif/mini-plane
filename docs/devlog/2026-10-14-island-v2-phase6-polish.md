# 阶段 6：打磨（2026-10-14）

> 调研：`docs/research/2026-10-14-phase6-polish-preflight.md`（PASS 100）。
> 提交：`3960737`；最终打包：`mini-plane-1.0.0-local-20261014-232722`。

---

## 一、调研判读（先于动手）

1. **底盘已对**：进度条已是 scaleX 合成动画 + `role=progressbar` + aria 三件套 +
   motion-reduce（阶段 1 打的底），动效令牌已存在——**不需要 Framer Motion**，
   CSS 覆盖 80–90% 微交互（三个来源互证），且零依赖符合项目红线。
2. **缺一致性层**：卡片无 hover/press/进场、把手无 press——"逐组件各自动画"的前兆形态。
3. **明确不做**（判定依据在简报）：内容自适应窗高（与用户手动缩放打架）、
   数字 count-up（低收益高复杂度）。

## 二、实施（全部 CSS/token 级零依赖）

| 项 | 实现 | 依据 |
|---|---|---|
| `--ease-spring` 令牌 | `cubic-bezier(0.34,1.56,0.64,1)` 轻过冲，仅限小元素 transform | ui-skills / alexevans 同款曲线 |
| 卡片 hover | `translateY(-2px)` + 边框加深，150ms | hover 即时、离场渐出 |
| 卡片 press | `scale(0.98)`（0.95 以下是卡通） | ui-skills press 反馈 |
| 卡片进场 stagger | fade + rise 8px，`index*40ms`（30–60ms 区间），`prefers-reduced-motion` 用户直达终态 | Emil Kowalski stagger 区间 |
| 把手 press | `active:scale(0.97)` | 同 press 规范 |
| AGENT·RUNNING 脉冲 | 核对确认**已有**（阶段 1 的 `motion-safe:animate-pulse`）；IDLE 恒静（禁用态无动画） | — |

红线对照：全部 transform/opacity ✓ · 150–250ms（进场 300ms 属页面级允许区）✓ ·
reduced-motion 全关 ✓ · 零依赖 ✓。

## 三、overview 真机冒烟（补阶段 4 遗留）

`smoke_realtime.py` 新增 7 条真机检查（真 daphne + 真 Cookie + 真 TCP）：

```
25. overview 握手确认帧 event = connected        ✓
26. 握手帧带 user_id                              ✓
27. subscribe 回执 event = subscriptions          ✓
28. 回执 subscribed 含该项目                       ✓
29. 回执 denied 为空（member 有权限）              ✓
30. overview 心跳 pong                             ✓
31. 匿名连 overview 的关闭码 = 4401                ✓
```

**真跑 32/32 全过**（含既有 25 条项目通道检查）。
注意：脚本对本机 HTTP 请求要**清掉代理环境变量**再跑（沙箱代理会 502）——
已记入脚本头注释。

## 四、验证

| 项 | 结果 |
|---|---|
| 前端门禁 | tsc 0 · eslint 0 · 单测 139 |
| smoke_realtime（真机） | **32/32** |
| 打包 | package + portable + exe（源=最新 20261014-232722）|
| 产物冒烟 | 面板首展 ✓ · 把手 200×32 ✓ |
| CI | 提交后核对（见下） |

## 五、Island V2 六阶段全部收官

| 阶段 | 状态 |
|---|---|
| 0 规格 / 1 总览 UI / 2 桌面窗口 / 3 后端数据 | ✅（10-13）|
| 2.5 交互补全 / 4 实时闭环 / 5 回归交付 | ✅（10-14）|
| **6 打磨** | ✅（本文） |

后续可选项（不排期）：原生圆角窗口（Win32 裁剪，远期实验）。
