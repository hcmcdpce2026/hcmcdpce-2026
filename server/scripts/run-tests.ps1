# Run integration tests: start a clean server, run API tests, stop the server.
# (ASCII only - Windows PowerShell 5.1 reads .ps1 as ANSI.)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

Write-Output '[1/4] Stopping running servers and unlocking test accounts...'
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch {} }
Start-Sleep -Milliseconds 800

node -e "const {getDb}=require('./server/lib/db');const db=getDb();db.prepare('UPDATE users SET failed_attempts=0,locked_until=NULL').run();db.prepare('DELETE FROM login_attempts').run();console.log('  -> accounts unlocked');"

Write-Output '[2/4] Starting server...'
$env:RATE_LIMIT_DISABLED = 'true'
$proc = Start-Process -FilePath (Get-Command node).Source `
    -ArgumentList 'server/index.js' `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $root 'server\data\server.out.log') `
    -RedirectStandardError (Join-Path $root 'server\data\server.err.log')
Start-Sleep -Seconds 2

$code = 1
try {
    Write-Output '[3/4] Running API tests...'
    $log = Join-Path $root 'server\data\test-result.jsonl'
    node server/scripts/test-api.js --jsonl $log
    $code = $LASTEXITCODE
    if (Test-Path $log) { Get-Content $log -Encoding UTF8 }
}
finally {
    Write-Output '[4/4] Stopping test server...'
    try { if ($proc -and !$proc.HasExited) { $proc.Kill() } } catch {}
    Remove-Item Env:\RATE_LIMIT_DISABLED -ErrorAction SilentlyContinue
}
exit $code
