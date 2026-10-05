"""中文字体瘦身：只自托管需要的字重分片，不再安装两个 154MB 的字体包。

## 背景

`docs/devlog/2026-10-04-structure-audit.md` 量到：
`@fontsource/noto-serif-sc` 83 MB + `@fontsource/noto-sans-sc` 71 MB = **154 MB**，
且 `index.css` 声明 **101 个 @font-face**（9 个字重 × 102 个 unicode 分片）。

## 为什么不能只改 import 字重

改成 `@fontsource/noto-sans-sc/400.css` 只是**引用变少**，
node_modules 里 918 个 woff2 **一个都不会少**，磁盘一点都不省。
要省磁盘必须**不装这两个包**，把需要的分片自托管。

## 保留哪些

- 字重 **400 / 500**：设计红线"字重不超过 500"，代码里也没有 600/700
- 全部 102 个分片：中文按 unicode 区段切分，缺一段就局部掉字（绝不能省）
- **只保留 woff2**：@fontsource 的每个 @font-face 都带 woff2 + woff 两条 src，
  woff 是给 2016 年前浏览器的回退。本项目不需要，而且留着会：
  ① 让 src 里出现指向已删除 ./files/ 的死链（构建直接报 Module not found）
  ② 白占一倍体积
"""

from __future__ import annotations

import os
import pathlib
import re
import shutil

FRONTEND = pathlib.Path(r"C:\palne\frontend")

# 源包目录：默认 node_modules，也可指向临时装的副本
# （本脚本执行完就不再需要那两个 154MB 的包，所以支持"装到临时目录、抽完即弃"）
NM = pathlib.Path(os.environ.get("FONTSOURCE_DIR", str(FRONTEND / "node_modules" / "@fontsource")))
OUT_DIR = FRONTEND / "public" / "fonts"
OUT_CSS = FRONTEND / "app" / "fonts-cjk.css"

FAMILIES = [("noto-sans-sc", "Noto Sans SC"), ("noto-serif-sc", "Noto Serif SC")]
WEIGHTS = ["400", "500"]

OUT_DIR.mkdir(parents=True, exist_ok=True)

HEADER = """/*
 * 中文字体（思源黑体 / 思源宋体）—— 自托管，只含 400 / 500 两个字重。
 *
 * 由 scripts/extract-cjk-fonts.py 从 @fontsource 抽取生成，**不要手改**；
 * 要改字重就改脚本里的 WEIGHTS 再跑一次。
 *
 * 为什么不直接 @import "@fontsource/noto-*-sc/index.css"：
 *   那样 node_modules 会装下 9 个字重 × 102 个分片 = 154 MB，
 *   而本项目实际只用到 400 / 500（设计红线：字重不超过 500，代码里也没有 600/700）。
 *   注意：只把 import 改成 400.css 是**省不了磁盘**的 —— 包里的文件一个都不会少。
 *
 * 全部分片都保留：中文按 unicode 区段切分，缺一段就会局部掉字。
 * 只保留 woff2：去掉 @fontsource 自带的 woff 回退，既省一半体积，
 *   也避免 src 里出现指向已删除 ./files/ 的死链（会让构建报 Module not found）。
 */"""

blocks = [HEADER]
copied = 0
copied_bytes = 0

for pkg, family in FAMILIES:
    pkg_dir = NM / pkg
    if not pkg_dir.exists():
        print(f"跳过 {pkg}：源目录 {NM} 下没有这个包（可用 FONTSOURCE_DIR 指向临时装的副本）")
        continue
    for w in WEIGHTS:
        css_path = pkg_dir / f"{w}.css"
        if not css_path.exists():
            continue
        css = css_path.read_text(encoding="utf-8")
        out_blocks: list[str] = []
        for chunk in css.split("@font-face")[1:]:
            body = "@font-face" + chunk.split("}")[0] + "}"
            # 只留 woff2 那一条 src，并把它指向 /fonts/
            urls = re.findall(r"url\(([^)]+)\)", body)
            woff2 = next(
                (u.strip().strip("\"'") for u in urls if u.strip().endswith(".woff2")), None
            )
            if not woff2:
                continue
            src_file = pkg_dir / woff2.lstrip("./")
            if not src_file.exists():
                continue
            dst = OUT_DIR / src_file.name
            if not dst.exists():
                shutil.copy2(src_file, dst)
                copied += 1
                copied_bytes += src_file.stat().st_size
            # 重写 src：只保留 woff2，format 也只留 woff2
            new_body = re.sub(
                r"src:\s*[^;]+;",
                f"src: url(/fonts/{src_file.name}) format('woff2');",
                body,
                count=1,
            )
            out_blocks.append(new_body)
        blocks.append(f"\n/* ── {family} {w} ── */")
        blocks.extend(out_blocks)
        print(f"  {pkg} {w}: {len(out_blocks)} 条 @font-face（仅 woff2）")

OUT_CSS.write_text("\n".join(blocks) + "\n", encoding="utf-8")
print(f"\n已复制 {copied} 个 woff2（{copied_bytes / 1024 / 1024:.1f} MB）→ {OUT_DIR}")
print(f"已生成 {OUT_CSS}（{sum(b.count('@font-face') for b in blocks)} 条规则）")
