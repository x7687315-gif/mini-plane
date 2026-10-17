# 热修：桌面版“工程数据加载失败”（迁移未应用）—— 2026-10-17

> 用户截图反馈：Island 面板与主窗口都显示“工程数据加载失败 / 无法加载我的工程”。
> 定性：**后端在运行，但 `/projects/mine/` 查询 500**。
> 提交：见 git log；打包：`mini-plane-1.0.0-local-20261017-160232`。

---

## 一、根因（三证据闭环）

1. `runtime/backend.log` 尾部：`django.db.utils.OperationalError: no such column: U0.current_step`
   —— 阶段 3（10-13）给 `AgentSession` 加的四个字段，**桌面运行时库里没有这些列**。
2. `runtime/backend-setup.log` 时间戳停在 **9-21**，且 `runtime/miniplane_migrated`
   标记文件也是 9-21 创建——桌面启动器的 `first_run_migrate()` 是
   **“首次启动跑一次 + 标记文件”的一次性逻辑**，此后启动再也不 migrate。
3. `showmigrations agents --settings=config.settings.desktop` 实锤：
   `agents.0003 [ ]` 未应用。

**因果链**：阶段 3 加迁移（10-13）→ 桌面库停在 9-21 schema → mine/ 的
`agent_step` 等子查询找不到列 → 500 → 前端显示“检查后端是否在运行”
（**文案误导：后端其实在跑**）。

**为什么之前没抓到**：阶段 3 之后的桌面冒烟只验证了“窗口在不在”，
**没有验证数据层**（mine/ 是否 200、字段是否在）。验收缺口，记入教训。

## 二、修复（根因级，非打补丁）

| # | 改动 | 文件 |
|---|---|---|
| 1 | `first_run_migrate()` → **`ensure_migrated()`：每次启动都跑 migrate**（幂等，无迁移时毫秒级返回），删标记文件逻辑 | `desktop/launcher.py` |
| 2 | **单实例锁**（命名 mutex）：已有一个 MiniPlane 在跑时第二个实例静默退出——日志实测用户双开过两个实例（15:36:32/33 两套启动记录），互相抢端口/后端 | `desktop/launcher.py` |
| 3 | 对用户机器上的运行时库**立即补迁移**（`migrate agents --settings=config.settings.desktop`，0003 已应用） | runtime/miniplane.sqlite3 |
| 4 | **文案去误导**：两处错误提示不再只提示“后端没运行”，改为“可能是后端未启动，也可能是数据服务异常；可查看 runtime\launcher.log 与 backend.log 定位” | `EngineeringIslandOverview.tsx`、`app/(protected)/page.tsx` |

## 三、验证（这次带数据层）

| 项 | 结果 |
|---|---|
| 运行时库迁移状态 | agents.0001–0003 **全部 [X]** |
| 端到端（desktop settings + 真 HTTP） | 登录 200 → 建工作区 201 → 建项目 201 → **mine/ 200 带 1 个项目** |
| 阶段 3 新字段 | recent_done / latest_log / agent_step / agent_method / agent_step_index / agent_step_total **全在响应里** |
| 产物冒烟（新 exe） | 面板 + 把手在 ✓ · 圆角 dwm ✓ · mine/ 401（未登录正确拒绝，**不再 500**）✓ |
| 前端门禁 | tsc 0 · eslint 0 · 单测 139 |
| desktop lint | ruff 全绿 |
| 打包 | package + portable + exe 全过（源=20261017-160232） |

## 四、教训（写入项目记忆）

1. **“首次跑一次”的优化要给迁移留后路**：桌面/单机应用只要还会发新迁移，
   “启动时确保 schema 最新”就必须是**每次启动**的动作，而不是一次性标记。
2. **冒烟必须验数据，不能只验窗口**：窗口存在 ≠ 应用可用。
   桌面冒烟清单加一条：`mine/` 登录后 200 且带真实项目。
3. **错误文案不要替用户猜原因**：“检查后端是否在运行”把查询 500 误导成进程没起，
   本次排查就差点被它带偏；文案应指向可查的证据（日志路径）。
