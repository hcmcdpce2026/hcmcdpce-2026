# Start the portal server in the background, logging to server/data/.
# (ASCII only - Windows PowerShell 5.1 reads .ps1 as ANSI.)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$outLog = Join-Path $root 'server\data\server.out.log'
$errLog = Join-Path $root 'server\data\server.err.log'

Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch {} }
Start-Sleep -Milliseconds 600

$proc = Start-Process -FilePath (Get-Command node).Source `
    -ArgumentList 'server/index.js' `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog

Start-Sleep -Seconds 2
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8099/api/public/health' -TimeoutSec 10
    Write-Output "Server running (PID $($proc.Id)). Health: $($res.StatusCode)"
} catch {
    Write-Output "Server unreachable. See log: $errLog"
    Get-Content $errLog -Tail 40 -ErrorAction SilentlyContinue
    exit 1
}
