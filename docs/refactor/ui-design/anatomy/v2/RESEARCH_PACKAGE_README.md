# Mini Plane 工程解剖图：技术调研报告交付包

本包围绕 Mini Plane 的 Interactive Engineering Plate / 交互式工程解剖图，汇总设计方向、仓库静态审计、成熟技术与开源项目调研、目标架构、数据语义、渐进式实施路线、验证矩阵及 AI Agent 执行模板。

## 文件

- `Mini_Plane_Anatomy_Technical_Research.pdf`：阅读版，25 页 A4。
- `Mini_Plane_Anatomy_Technical_Research.md`：主要报告源文档；图示使用相对路径 `assets/`，建议与 `assets` 目录一起使用。
- `Mini_Plane_Anatomy_Technical_Research.html`：离线网页阅读版，引用同目录中的 `report.css` 与 `assets/`。
- `report.css`：HTML/PDF 排版样式。
- `assets/*.svg`：四张原创概念示意图的可编辑矢量源文件。
- `assets/*.png`：对应的预览图。
- `build_report.sh`：可选的本地重建脚本（需要 Pandoc、WeasyPrint，以及合适的中文字体）。
- `create_diagrams.py`：生成概念图的脚本（需要 Pillow、CairoSVG；只绘制示意图，不会访问 Mini Plane 应用或数据库）。

## 证据边界

报告审计日期为 2026-10-25。仓库事实依据公开源码与文档静态核对；开源库能力与许可依据其公开仓库/官方文档。报告里的概念图是本报告生成的设计示意图，不是 Mini Plane 运行截图。本次没有在用户目标机器上重新安装依赖、启动 Mini Plane、运行前端/后端测试或完成浏览器性能基准；需要执行的门禁在报告的验证矩阵中明确列出。

## 本地重建 PDF

在已安装 `pandoc` 和 `weasyprint` 的环境下，在此目录运行：

```bash
./build_report.sh
```

如只需要给 AI Agent 继续工作，优先把 Markdown 报告和整个 `assets/` 目录一起提供；提示 Agent 先读取报告中的“第一阶段执行模板”，先审计并做静态对象，再按门禁逐步实现，避免一次性重写。
