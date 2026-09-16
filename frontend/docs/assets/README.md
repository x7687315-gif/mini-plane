# frontend/docs/assets/

设计稿静态截图，用于 README / 文档展示当前设计语言。

## 文件清单

| 文件 | 屏幕 | 尺寸 |
|------|------|------|
| `preview-login.png` | 登录页 | 1440 × 900 |
| `preview-issue-list.png` | Issue 列表页（核心页） | 1440 × 900 |
| `preview-issue-drawer.png` | Issue 详情侧拉抽屉 | 1440 × 900 |

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
for i in 01 02 03; do
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
```

> `--virtual-time-budget=12000` 让 headless Chrome 等待 Google Fonts 加载完成；fallback 字体（Times New Roman / Arial）保证即便离线也能呈现"近似的 Blueprint Editorial"。

## src/ HTML 的可维护性

`src/` 下的 HTML 是**纯静态的视觉稿**，不是真实的产品代码。改设计时直接改 `src/0N-*.html`，再跑上面的截图脚本。

不要把这些 HTML 与 Sprint 后续产生的 Next.js 组件混在一起 —— 它们是不同物种：
- `src/*.html` → 给 README 看的视觉演示稿
- Sprint 后续的 `app/**` → 真实可交互的产品代码

## 第二阶段（真实项目截图）

当 Sprint 3（Issue 核心）完成后，这里会被**真实项目截图**替换：
- `preview-issue-list.png` ← Sprint 3 真实列表页
- `preview-issue-drawer.png` ← Sprint 3 真实 drawer
- 额外加入：`preview-issue-create.png` / `preview-realtime.png` / `preview-board.png`

设计稿保留在 `src/` 作为设计意图的"原版"参照。