@echo off
setlocal EnableExtensions
rem Mini Plane 桌面版双击入口：用 pythonw 免黑框，日志写在 runtime/ 下
set "ROOT=%~dp0"
set "PYW=%ROOT%backend\.venv\Scripts\pythonw.exe"
if not exist "%PYW%" set "PYW=%ROOT%backend\.venv\Scripts\python.exe"
if not exist "%PYW%" (echo [ERROR] backend venv python not found & pause & exit /b 1)
start "Mini Plane" "%PYW%" "%ROOT%desktop\launcher.py"
