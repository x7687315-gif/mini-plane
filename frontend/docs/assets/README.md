# frontend/docs/assets/

文档与 README 用的图。**分两类，不要混淆**：

## 一、真实产品截图（`real-*.png`）—— 推荐引用这些

真实登录态 + 真实后端数据 + 生产构建下截的，等于用户实际看到的样子。

| 文件 | 屏幕 | 尺寸 |
|------|------|------|
| `real-issue-list.png` | Issue 列表页（核心页，含真实数据与 `● live` 连接指示器） | 1440 × 900 |
| `real-issue-drawer-activity.png` | 抽屉 · Activity 审计时间线 | 1440 × 900 |
| `real-issue-drawer-comments.png` | 抽屉 · Comments 对话 | 1440 × 900 |
| `real-bulk-actions.png` | 多选 3 行后的批量操作条（Sprint 6） | 1440 × 900 |

**重新采集**（前置：后端 + 前端都在跑，且先跑过一次 `pnpm test:e2e` 生成登录态）：

```bash
cd frontend
pnpm test:e2e                      # 重置演示数据 + 生成 .auth/user.json
node scripts/capture-screenshots.mjs
```

## 二、设计稿静态截图（`preview-*.png`）—— 历史资产

`src/*.html` 渲染出来的视觉稿，记录**设计意图**。产品已实现，所以看实际效果请用上面那组；
这一组保留作为"当初想做成什么样"的参照。

| 文件 | 屏幕 | 尺寸 |
|------|------|------|
| `preview-login.png` | 登录页 | 1440 × 900 |
| `preview-issue-list.png` | Issue 列表页（核心页） | 1440 × 900 |
| `preview-issue-drawer.png` | Issue 详情侧拉抽屉 | 1440 × 900 |
| `preview-issue-drawer-thread.png` | Issue 抽屉 · Activity / Comments tab（Sprint 4） | 1440 × 900 |

## 设计语言代号

**Blueprint Editorial（蓝图编辑风）** —— 见 [../../DESIGN.md](../../DESIGN.md)。

设计要素速览：
- 暖灰白底 `#F4F1EA` + 深炭文字 `#1B1A17` + 钴蓝高亮 `#1F3FA8`
- 衬线大写（Cormorant Garamond italic）+ 无衬线正文（Inter）
- 32px 细网格 + 0.5px 直角边框 + 坐标轴 / 十字标记 / 装饰词
- 直角构图为主、克制高亮、绝无渐变 / 阴影 / 毛玻璃

## 重新生成截图

截图脚本基于 **Chrome headless**（系统已装）：

```bash
# Windows / Git Bash
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"

# 1) 准备纯 ASCII 临时目录（避免中文路径在 file:// URL 中编码问题）
mkdir -p /c/temp/mpshot
cp frontend/docs/assets/src/*.html /c/temp/mpshot/

# 2) 截图（每张独立 user-data-dir，避免 session 复用问题）
for i in 01 02 03 04; do
  "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 \
    --user-data-dir="C:/temp/mpshot/prof_$i" \
    --window-size=1440,900 \
    --virtual-time-budget=12000 \
    --screenshot="C:/temp/mpshot/$i.png" \
    "file:///C:/temp/mpshot/$i.html" 2>/dev/null
done

# 3) 复制到项目
cp /c/temp/mpshot/01.png frontend/docs/assets/preview-issue-list.png
cp /c/temp/mpshot/02.png frontend/docs/assets/preview-issue-drawer.png
cp /c/temp/mpshot/03.png frontend/docs/assets/preview-login.png
cp /c/temp/mpshot/04.png frontend/docs/assets/preview-issue-drawer-thread.png
```

> `--virtual-time-budget=12000` 让 headless Chrome 等待 Google Fonts 加载完成；fallback 字体（Times New Roman / Arial）保证即便离线也能呈现"近似的 Blueprint Editorial"。

## src/ HTML 的可维护性

`src/` 下的 HTML 是**纯静态的视觉稿**，不是真实的产品代码。改设计时直接改 `src/0N-*.html`，再跑上面的截图脚本。

不要把这些 HTML 与 Sprint 后续产生的 Next.js 组件混在一起 —— 它们是不同物种：
- `src/*.html` → 给 README 看的视觉演示稿
- Sprint 后续的 `app/**` → 真实可交互的产品代码

## 第二阶段（真实项目截图）—— ✅ 已结清（2026-09-18）

Sprint 3 起欠的"用真实截图替换"，在集成验收当天补齐了：
栈能真正跑起来之后（本机其实一直可以，见
[integration-verification.md §一](../devlog/integration-verification.md)），
真实截图一次性采齐 4 张，且做成了可重跑的脚本。

设计稿保留在 `src/` 作为设计意图的"原版"参照 —— 两类图各有用途，别互相替换。