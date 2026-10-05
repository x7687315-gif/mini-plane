# 中文字体瘦身：154 MB → 10.7 MB（自托管分片）

> 2026-10-05 · 落实结构体检报告里的技术债：`@fontsource` 两个中文字体包占 **154 MB**。
> 结果：node_modules 侧 **-135.7 MB**；中文渲染**实测正常**；构建、单测全绿。

---

## 一、为什么"改 import 字重"没用

`@fontsource/noto-serif-sc` 83 MB + `@fontsource/noto-sans-sc` 71 MB，
`index.css` 声明 **101 个 @font-face**（9 个字重 × 102 个 unicode 分片）。

把 import 改成 `/400.css` 只是**引用变少**——node_modules 里 918 个 woff2
**一个都不会少**，磁盘一点不省。要省磁盘必须**不装这两个包**。

## 二、做法

新增 `scripts/extract-cjk-fonts.py`：
- 从字体包里抽取 **400 / 500** 两个字重（设计红线"字重不超过 500"，代码里也没有 600/700）
- **全部分片都保留**：中文按 unicode 区段切分，缺一段就局部掉字（绝不能省）
- **只保留 woff2**，去掉 woff 回退——既省一半体积，也避免 `src` 里出现指向已删
  `./files/` 的死链（第一次构建就报了 `Module not found`，就是这个原因）
- 复制 404 个 woff2（**10.7 MB**）到 `public/fonts/`，生成 `app/fonts-cjk.css`
  （404 条 @font-face，`unicode-range` 原样保留）
- `globals.css` 的两行 `@import "@fontsource/noto-*-sc/index.css"` 换成 `@import "./fonts-cjk.css"`
- `package.json` 移除这两个依赖

## 三、连锁问题与修法（这轮真正的价值在这里）

### ① pnpm 的依赖检查会被"批量删除保护"拦死

移除依赖后，`pnpm dev` 自动的 `runDepsStatusCheck` 会跑 `pnpm install`，
它在清理临时目录时撞上本机的批量删除保护（4478 个文件 > 阈值 50）→ **dev server 起不来**。
**修法**：`pnpm install --lockfile-only` 只更新 `pnpm-lock.yaml`（不动文件），
lockfile 一致后 `pnpm dev` 恢复正常（实测 Ready in 1.5s）。CI 也不会因 lockfile 漂移而红。

### ② build.py --portable 会"默默选中旧的 app"

`sorted(dist/*/app)` 按字母序取第一个 —— dist 里积累多个带时间戳的包目录时，
**刚构建完的新包排在旧包后面**，桌面版打进去的是昨天的前端。
这与本周"改了源码 exe 里没有"是同一类问题。**修法**：按 `st_mtime` 取最新的。

### ③ 窗口监视的 3 秒竞态（真机抓到）

重建后验证关窗退出，**失败了一次**。日志：
`[watch] 启动后未发现主窗口（窗口可能创建失败），本次不启用监视`——
监视线程原来**只等 3 秒**就判断"窗口创建失败"并整个放弃；这次 GUI 子进程建窗口慢于 3 秒。
之前三次通过纯属运气。**修法**：先"等到窗口出现"（最长 60 秒）再开始监视它消失。
修后连续两次真机验证通过（窗口 +1s 消失 → 进程 0、端口空）。

## 四、验证

| 项 | 结果 |
|----|------|
| 中文渲染 | **截图实测正常**（侧栏"我的工程/我的工作"、状态条、NOW/NEXT 全部清晰，即思源黑体） |
| 字体可达 | `/fonts/noto-sans-sc-100-400-normal.woff2` → HTTP 200（34 KB） |
| 生产构建 | `next build` ✓（第一次失败正是 woff 死链，已修） |
| 前端单测 | **129** 全绿 |
| 关窗退出 | 真机 **2 次复现**：`{'MiniPlane': 0, '端口': []}` ✅ |
| 桌面包 | `MiniPlane/app/public/fonts` 404 个 woff2 ✓，exe 重建于 10-05 12:45 |
| ruff | scripts/ desktop/ 全绿 |

## 五、体积

| 项 | 前 | 后 |
|----|----|----|
| `node_modules/@fontsource` | 154 MB | **7.6 MB** |
| `frontend/public/fonts` | 0 | 10.7 MB（进仓库，自托管必需） |
| **净变化** | | **-135.7 MB** |

## 六、教训

1. **省磁盘必须动"装了什么"，不是动"引用了什么"**。
2. **定时等待是竞态的温床**："等 3 秒"应写成"等到条件成立（带上限）"。
   这次监视线程整个失效，就是 3 秒不够长。
3. 构建脚本里任何"从多个候选里挑一个"的逻辑，**必须按时间挑最新的**，
   否则迟早把旧产物打进包里。
