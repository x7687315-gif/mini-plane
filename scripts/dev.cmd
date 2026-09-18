@echo off
rem Double-click entry point. The real logic lives in dev.ps1 (same folder).
rem   no args = start the stack | down = stop | status = check | e2e = run Playwright
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
