param(
    # up (default) / down / status / e2e
    [string]$Cmd = 'up'
)

# ============================================================
#  Mini Plane - local launcher (backend + frontend + E2E)
#
#  Dev flow:
#    .\dev.ps1              start backend + frontend, wait, open browser
#    .\dev.ps1 e2e          start the stack, then run Playwright (14 specs)
#    .\dev.ps1 status       is each port answering?
#    .\dev.ps1 down         stop whatever listens on 8000 / 3000
#
#  A dev.cmd shim sits next to this file so the whole thing is
#  double-clickable from Explorer (cmd -> powershell -File dev.ps1).
# ============================================================

$ErrorActionPreference = 'Stop'

$Root     = Split-Path -Parent $PSScriptRoot
$Backend  = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$Py          = Join-Path $Backend '.venv\Scripts\python.exe'
$BackendUrl  = 'http://127.0.0.1:8000/api/v1/health/'
$FrontendUrl = 'http://localhost:3000/login'

function Write-Info($msg)  { Write-Host $msg }
function Write-Err($msg)   { Write-Host $msg -ForegroundColor Red }

function Test-Prerequisites {
    if (-not (Test-Path $Py)) {
        Write-Err "[ERROR] backend venv not found: $Py"
        Write-Err "        create it first:  cd backend ; python -m venv .venv"
        return $false
    }
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Err "[ERROR] pnpm not found on PATH - run this from a shell where pnpm works"
        return $false
    }
    return $true
}

function Test-PortUp([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-Ready([string[]]$Urls, [int]$Seconds = 90) {
    foreach ($u in $Urls) {
        $ok = $false
        for ($i = 0; $i -lt ($Seconds * 2) -and -not $ok; $i++) {
            try {
                $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
                if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { $ok = $true }
            } catch { Start-Sleep -Milliseconds 500 }
        }
        if ($ok) { Write-Info ("  READY   " + $u) }
        else     { Write-Info ("  TIMEOUT " + $u); return $false }
    }
    return $true
}

function Start-Stack([bool]$OpenBrowser) {
    if (-not (Test-Prerequisites)) { return $false }

    if ((Test-PortUp 8000) -or (Test-PortUp 3000)) {
        Write-Info "[skip] stack is already up (8000/3000 listening) - not starting twice"
        return $true
    }

    Write-Info "[1/3] starting backend   (http://127.0.0.1:8000) ..."
    Start-Process -FilePath $Py -ArgumentList 'manage.py', 'runserver', '127.0.0.1:8000', '--noreload' `
        -WorkingDirectory $Backend -WindowStyle Hidden

    Write-Info "[2/3] starting frontend  (http://localhost:3000) ..."
    $pnpm = (Get-Command pnpm).Source
    Start-Process -FilePath $pnpm -ArgumentList 'dev' `
        -WorkingDirectory $Frontend -WindowStyle Minimized

    Write-Info "[3/3] waiting for both to answer (first start compiles, ~30s) ..."
    if (-not (Wait-Ready @($BackendUrl, $FrontendUrl))) {
        Write-Err "[ERROR] something did not come up - see the windows/logs above"
        return $false
    }

    if ($OpenBrowser) { Start-Process 'http://localhost:3000' }

    Write-Info ""
    Write-Info "  backend   : http://127.0.0.1:8000/api/v1/health/"
    Write-Info "  frontend  : http://localhost:3000   (use localhost, NOT 127.0.0.1)"
    Write-Info "  stop      : .\dev.ps1 down"
    Write-Info ""
    return $true
}

function Stop-Stack {
    Write-Info "stopping anything listening on 8000 / 3000 ..."
    $killed = @()
    foreach ($p in 8000, 3000) {
        Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
            ForEach-Object {
                $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
                if ($proc) {
                    $killed += ("{0}({1})" -f $proc.ProcessName, $proc.Id)
                    Stop-Process -Id $proc.Id -Force
                }
            }
    }
    if ($killed.Count) { Write-Info ("  stopped: " + ($killed -join ', ')) }
    else               { Write-Info "  nothing was listening" }
}

function Show-Status {
    foreach ($pair in @(@('backend  (8000/api/v1/health/)', $BackendUrl),
                        @('frontend (3000/login)',            $FrontendUrl))) {
        try {
            $r = Invoke-WebRequest -Uri $pair[1] -UseBasicParsing -TimeoutSec 4 -ErrorAction Stop
            Write-Info ("{0} -> HTTP {1}" -f $pair[0], $r.StatusCode)
        } catch {
            Write-Info ("{0} -> DOWN" -f $pair[0])
        }
    }
}

switch ($Cmd.ToLower()) {
    'up'     { if (Start-Stack $true)  { exit 0 } else { exit 1 } }
    'status' { Show-Status; exit 0 }
    'down'   { Stop-Stack; exit 0 }
    'e2e'    {
        if (-not (Start-Stack $false)) { exit 1 }
        Write-Info ""
        Write-Info "running Playwright E2E (14 specs - it resets its own demo data) ..."
        Push-Location $Frontend
        try   { pnpm test:e2e; $rc = $LASTEXITCODE }
        finally { Pop-Location }
        Write-Info ""
        if ($rc -eq 0) { Write-Info "E2E: ALL PASSED" } else { Write-Err "E2E: FAILED - see the report above" }
        Write-Info "stack is still running. stop it with: .\dev.ps1 down"
        exit $rc
    }
    default {
        Write-Err "[ERROR] unknown command: $Cmd"
        Write-Info  "usage: dev.ps1 [up | down | status | e2e]"
        exit 1
    }
}
