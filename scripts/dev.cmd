@echo off
rem Double-click entry point. The real logic lives in dev.ps1 (same folder).
rem   no args = start the stack | down = stop | status = check | e2e = run Playwright
rem
rem "pause" at the end keeps this window open on ANY outcome - a silent flash-close
rem is how the very first failure (UTF-8 no-BOM parse error) went unseen.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
echo.
pause
