# 阶段 5：回归与交付（2026-10-14）

> Island V2 六阶段路线的"收官"阶段：全量回归 + 桌面打包 + README 重写。
> 提交：见 git log；CI 双绿（`5d53f16` 起）。

---

## 一、CI 失败的根因与修复（先说这件事）

用户报告"远端 CI 没过"。排查链：

1. GitHub API 查 check-runs → **backend 任务的 `ruff format --check` 步骤失败**
2. 本地 `ruff format --check .` 却全绿 → 版本相同（test.txt 已钉 0.16.6）→ 怀疑环境差异
3. **LF worktree 复现**（`git -c core.autocrlf=false worktree add` 模拟 CI 检出）→
   `test_overview.py` 的 docstring 有前导空格（`""" stranger`），ruff 要求 `"""stranger`
4. 修复提交 `5d53f16` → CI **双绿**

**根因教训**：我的本地工作区是 CRLF（autocrlf=true），ruff 的 auto 行尾检测让
格式检查在某些差异上**保持沉默**；CI 的 LF 检出会暴露。→ 以后怀疑格式类 CI 失败时，
先开一个 `core.autocrlf=false` 的 worktree 用 CI 视角复检，别信本地绿。

## 二、全量回归

| 项 | 结果 |
|---|---|
| 后端全量 | **352 OK**（realtime 24 条含 overview 6 条） |
| 前端门禁 | tsc 0 · eslint 0 · 单测 139 |
| E2E 全量 | **25 passed**；末尾 6 条（issue-thread×4 + mode-switch×2）挂——**与两天前完全相同的形态**：5 分钟长跑把 dev server 拖垮；这 6 条单独/合跑**8/8 全过**（本次合跑确认）→ 判定环境退化，非代码问题 |
| 打包 | package + portable（源=最新 20261014-225434）+ exe 全过 |
| 打包产物冒烟 | 主窗口 ✓ · 把手 200×32 ✓ · **面板首展（M1）** ✓（onboarded=false 重置后） |

## 三、README 更新

- §2.4 Engineering Island 整节重写：多项目总览 / 六问信息设计 / 单一实时连接 /
  LIVE-离线诚实状态 / 权限实时收敛 / Island 圆角例外
- §2.5 桌面版改为**三窗口**描述（主窗口 + 面板 + 把手）+ 五条窗口行为
  （首展 / 图钉 / Alt+I 全局 / 拖动缩放 / 退出干净）
- 功能矩阵 Island 行同步

## 四、CI

`5d53f16`：backend + frontend **双绿**。

## 五、给用户的实测清单（新 exe 已就绪）

1. 双击 → **直接看到完整面板**（不再是细线）
2. 按住面板**页眉空白处**拖动 → 任意位置；重启后位置保持
3. 贴边/角 → 自由缩放（最小 360×96）；重启记住
4. 图钉固定 → 常驻；重启记住
5. Esc / 点把手 → 收起成 200×32 把手；再点 → 展开
6. Agent 起会话 → 卡片 AGENT·RUNNING **无刷新**变化（阶段 4 实时闭环）
7. 看 `runtime/launcher.log`：每次窗口操作都有 `[api] …` 与结果行

## 六、后续（阶段 6，未排期）

界面/动效/操作手感打磨（先做一轮小调研）；
`smoke_realtime.py` 补 overview 通道的真机条目。
