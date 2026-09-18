# -*- coding: utf-8 -*-
"""组装 Mini Plane 本地单机版软件包。

产物：dist/mini-plane-<版本>-local/
  app/                 前端生产构建（Next standalone + static + public）
  backend/             后端源码（不含 venv / 缓存 / 密钥）
  start.cmd            一键启动（后端 ASGI + 前端 Node，都只绑 127.0.0.1）
  stop.cmd             一键停止
  setup.cmd            首次运行：生成 SECRET_KEY、写运行配置、建 venv、装依赖、迁移
  README-本地版.md     首次运行说明（UTF-8 BOM，记事本可读）

安全基线（打包时固化，见 README）：
  - 只绑 127.0.0.1（不暴露局域网）
  - DEBUG=False
  - SECRET_KEY 首跑随机生成，存 runtime/（不进任何仓库）
  - 页面与 API 同 host（127.0.0.1），规避跨站 Cookie/CSRF 问题

用法：python scripts/package.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

VERSION = "0.2.0"
NAME = f"mini-plane-{VERSION}-local"
ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
BACKEND = ROOT / "backend"
DIST = ROOT / "dist" / NAME

FRONTEND_ENV = {
    # 页面在 127.0.0.1:3000，API 在 127.0.0.1:8000 —— 同 host（127.0.0.1），端口可不同
    "NEXT_PUBLIC_API_BASE": "http://127.0.0.1:8000",
    "NEXT_PUBLIC_WS_BASE": "ws://127.0.0.1:8000",
    "NEXT_TELEMETRY_DISABLED": "1",
}

EXCLUDE_BACKEND = {
    ".venv", "__pycache__", ".env", ".celery", "staticfiles", ".pytest_cache",
    "htmlcov", ".coverage",
}


def run(cmd: list[str], cwd: Path | None = None, env_extra: dict[str, str] | None = None) -> None:
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    print("$ " + " ".join(cmd))
    r = subprocess.run(cmd, cwd=cwd, env=env)
    if r.returncode != 0:
        sys.exit(f"[ERROR] 命令失败（退出码 {r.returncode}）：{' '.join(cmd)}")


def write(path: Path, text: str, bom: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    enc = "utf-8-sig" if bom else "utf-8"
    path.write_text(text.replace("\n", "\r\n"), encoding=enc)


# ---------------------------------------------------------------- 前端构建
def build_frontend() -> None:
    """在**临时副本**里用 npm 构建（而不是 pnpm）。

    原因：Next standalone + pnpm 的产物里，node_modules/{next,react,...} 是指向
    pnpm 虚拟存储的链接，复制到发布目录后全部断链（实测 server.js 依次报
    Cannot find module 'next' / '@swc/helpers'，逐个补是无底洞）。
    npm 的 node_modules 是扁平真实目录，standalone 产物自包含 —— 这是社区标准解法。
    """
    print("== 1/4 前端生产构建（npm + 127.0.0.1）==")
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        sys.exit("[ERROR] npm not found on PATH")

    build_dir = DIST.parent / ".build-frontend"
    if build_dir.exists():
        shutil.rmtree(build_dir)

    def ignore(src: str, names: list[str]) -> set[str]:
        skip = {"node_modules", ".next", ".git", "dist", ".venv", "test-results",
                "playwright-report", ".auth", ".env", ".env.local", ".env.*"}
        return {n for n in names if n in skip or n.startswith(".env")}

    shutil.copytree(FRONTEND, build_dir, ignore=ignore)

    npm_run = subprocess.list2cmdline([npm])
    run([npm, "install", "--no-audit", "--no-fund",
         "--registry=https://registry.npmmirror.com"], cwd=build_dir)
    run([npm, "run", "build"], cwd=build_dir, env_extra=FRONTEND_ENV)


# ---------------------------------------------------------------- 组装
def assemble() -> None:
    print("== 2/4 组装目录 ==")
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)
    build_dir = DIST.parent / ".build-frontend"

    # 前端 standalone（npm 构建产物：全部真实文件，无断链）
    app = DIST / "app"
    shutil.copytree(build_dir / ".next" / "standalone", app)
    shutil.copytree(build_dir / ".next" / "static", app / ".next" / "static")
    if (build_dir / "public").exists():
        shutil.copytree(build_dir / "public", app / "public")

    # 后端源码（排除虚拟环境/缓存/密钥）
    def ignore(src: str, names: list[str]) -> set[str]:
        return {n for n in names if n in EXCLUDE_BACKEND or n.endswith(".pyc")}

    shutil.copytree(BACKEND, DIST / "backend", ignore=ignore)


# ---------------------------------------------------------------- 启动器
LAUNCHERS = {
    "start.cmd": r"""@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
set "HOST=127.0.0.1"

if not exist "%ROOT%backend\.env" (
    echo [ERROR] run setup.cmd first - it creates backend\.env
    pause
    exit /b 1
)

echo [1/2] backend  (ASGI: HTTP + WebSocket on %HOST%:8000) ...
start "mini-plane backend" /min cmd /d /s /c "cd /d %ROOT%backend && .venv\Scripts\python.exe -m daphne -b %HOST% -p 8000 config.asgi:application"

echo [2/2] frontend  (Next standalone on %HOST%:3000) ...
set "HOSTNAME=%HOST%"
set "PORT=3000"
start "mini-plane frontend" /min cmd /d /s /c "cd /d %ROOT%app && node server.js"

echo waiting for both ...
powershell -NoProfile -Command "$u=@('http://127.0.0.1:8000/api/v1/health/','http://127.0.0.1:3000/login'); foreach($x in $u){ $ok=$false; for($i=0;$i -lt 120 -and -not $ok;$i++){ try{ $r=Invoke-WebRequest -Uri $x -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){$ok=$true} }catch{ Start-Sleep -Milliseconds 500 } } if($ok){ Write-Host ('  READY ' + $x) } else { Write-Host ('  TIMEOUT ' + $x) } }"

start "" "http://127.0.0.1:3000/login"
echo Mini Plane is running:  http://127.0.0.1:3000
echo stop with: stop.cmd    (closing this window does NOT stop the services)
pause
""",
    "stop.cmd": r"""@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
echo stopping Mini Plane (ports 8000 / 3000) ...
powershell -NoProfile -Command "foreach($p in 8000,3000){ Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }; Write-Host '  done'"
pause
""",
    "setup.cmd": r"""@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"

echo ============================================================
echo  Mini Plane first-run setup
echo  Requires on this machine:  Python 3.12+  Node 20+  PostgreSQL 16
echo ============================================================

if exist "%BACKEND%\.env" (
    echo [skip] backend\.env already exists - keeping current settings
    goto venv
)

echo Generating a random SECRET_KEY ...
powershell -NoProfile -Command "$b = 1..48 | ForEach-Object { Get-Random -Maximum 256 }; [IO.File]::WriteAllBytes('%TEMP%\mp_sk.bin', [byte[]]$b)"
powershell -NoProfile -Command "$sk = [Convert]::ToBase64String([IO.File]::ReadAllBytes('%TEMP%\mp_sk.bin')); $db = Read-Host 'PostgreSQL URL (enter = postgres://postgres@127.0.0.1:5432/miniplane)'; if(-not $db){ $db = 'postgres://postgres@127.0.0.1:5432/miniplane' }; $envtxt = @('SECRET_KEY=' + $sk, 'DEBUG=False', 'ALLOWED_HOSTS=127.0.0.1,localhost', 'DATABASE_URL=' + $db, 'CORS_ALLOWED_ORIGINS=http://127.0.0.1:3000', 'CSRF_TRUSTED_ORIGINS=http://127.0.0.1:3000', 'CACHE_URL=locmem://', 'CELERY_TASK_ALWAYS_EAGER=True'); $envtxt | Set-Content -Path '%BACKEND%\.env' -Encoding ascii; del '%TEMP%\mp_sk.bin'"
echo wrote backend\.env  (DEBUG=False, binds 127.0.0.1, SECRET_KEY randomized)

:venv
if not exist "%BACKEND%\.venv\Scripts\python.exe" (
    echo Creating backend virtual environment ...
    python -m venv "%BACKEND%\.venv" || (echo [ERROR] python 3.12+ required & pause & exit /b 1)
)
echo Installing backend dependencies ...
"%BACKEND%\.venv\Scripts\python.exe" -m pip install -q -r "%BACKEND%\requirements\local.txt"
if errorlevel 1 ( echo [ERROR] pip install failed & pause & exit /b 1 )

echo Applying database migrations ...
"%BACKEND%\.venv\Scripts\python.exe" manage.py migrate --noinput
if errorlevel 1 ( echo [ERROR] migrate failed - check DATABASE_URL in backend\.env & pause & exit /b 1 )

echo.
echo Setup complete. Start with: start.cmd
pause
""",
}


def write_launchers() -> None:
    print("== 3/4 写入启动器 ==")
    for name, body in LAUNCHERS.items():
        write(DIST / name, body)


README = """# Mini Plane 本地单机版

双击 **start.cmd** 启动，浏览器会自动打开 http://127.0.0.1:3000
停止用 **stop.cmd**。首次使用先跑一次 **setup.cmd**。

## 首次运行（setup.cmd 做的事）

1. 随机生成 SECRET_KEY 写入 backend\\.env（每台机器不同，勿外传该文件）
2. 询问 PostgreSQL 连接串（默认 postgres://postgres@127.0.0.1:5432/miniplane）
3. 创建 backend\\.venv 并安装依赖
4. 执行数据库迁移

## 本机要求

- Windows 10/11
- Python 3.12+（python 在 PATH）
- Node.js 20+（node 在 PATH）
- PostgreSQL 16（服务在本机运行；库不存在时请先创建，例如
  `createdb -U postgres miniplane` 或用 pgAdmin）

## 安全说明

- 所有服务**只绑定 127.0.0.1**，局域网内其他设备无法访问
- DEBUG 关闭；SECRET_KEY 随机生成、保存在本机 backend\\.env
- 数据库口令保存在本机 backend\\.env —— 该文件包含敏感信息，不要分发

## 常见问题

- **页面能开但登录报错**：检查 backend\\.env 的 DATABASE_URL 是否能连上
  （可用 backend\\.venv\\Scripts\\python -m opensaml 无需管，直接看 start.cmd 窗口
  里 backend 的日志）
- **8000 / 3000 被占用**：先跑 stop.cmd，或改 start.cmd 里的端口
  （改端口需同步改 backend\\.env 的 CORS/CSRF 白名单）

## 版本

"""
VERSION_NOTE = VERSION + "  ·  本地单机版  ·  构建于本机（见 docs/releases/）\n"


# ---------------------------------------------------------------- 主流程
def main() -> None:
    build_frontend()
    assemble()
    write_launchers()
    write(DIST / "README-本地版.md", README + VERSION_NOTE, bom=True)
    write(DIST / "VERSION", VERSION + "\n")
    print(f"== 4/4 完成 ==\n产物：{DIST}")
    print("打包成 zip 即可分发（目标机器需要 Python 3.12+ / Node 20+ / PostgreSQL 16）")


if __name__ == "__main__":
    main()
