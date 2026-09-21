<#
  Mini Plane 桌面快捷方式生成器。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File desktop\make_shortcut.ps1
    powershell ... -File desktop\make_shortcut.ps1 -Exe "C:\palne\dist\MiniPlane\MiniPlane.exe"

  - 不给 -Exe：默认指向 pythonw + desktop\launcher.py（源码运行，开发期用）。
  - 给 -Exe：指向已打包的 MiniPlane.exe（分发用）。
  目标、工作目录、图标都写全，双击即弹原生窗口。
#>
param(
    [string]$Exe = "",
    [string]$Name = "Mini Plane"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot           # 仓库根
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop "$Name.lnk"

if ($Exe) {
    if (-not (Test-Path $Exe)) { throw "找不到可执行文件：$Exe" }
    $target = (Resolve-Path $Exe).Path
    $argList = ''
    $workdir = Split-Path -Parent $target
} else {
    $pyw = Join-Path $root 'backend\.venv\Scripts\pythonw.exe'
    if (-not (Test-Path $pyw)) { throw "找不到 pythonw：$pyw（先建 venv / 装依赖）" }
    $launcher = Join-Path $root 'desktop\launcher.py'
    if (-not (Test-Path $launcher)) { throw "找不到启动器：$launcher" }
    $target = $pyw
    $argList = '"' + $launcher + '"'
    $workdir = $root
}

# 有 .ico 就用它当图标，否则回退 shell32 的一个通用图标
$ico = Join-Path $root 'desktop\miniplane.ico'
$icon = if (Test-Path $ico) { $ico } else { "$env:SystemRoot\System32\shell32.dll,137" }

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnkPath)
$sc.TargetPath = $target
$sc.Arguments = $argList
$sc.WorkingDirectory = $workdir
$sc.IconLocation = $icon
$sc.Description = 'Mini Plane 本地单机版（原生窗口 · 免装数据库）'
$sc.Save()

Write-Host "已创建快捷方式：$lnkPath"
Write-Host "  目标：$target $argList"
Write-Host "  工作目录：$workdir"
