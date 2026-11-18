# Full verification: fresh DB -> migrate -> seed -> API tests -> interconnect -> security scan.
# (ASCII only - Windows PowerShell 5.1 reads .ps1 as ANSI.)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($n, $text) { Write-Output ""; Write-Output "[$n] $text"; }

Step 1 'Stopping servers, rebuilding database from scratch...'
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch {} }
Start-Sleep -Milliseconds 800
Remove-Item server\data\portal.sqlite* -Force -ErrorAction SilentlyContinue
node server/db/migrate.js | Select-Object -Last 3
node server/db/seed.js --reset | Select-Object -Last 4

node -e "const fs=require('fs');const c={};fs.readFileSync('server/data/credentials.local.txt','utf8').split(/\r?\n/).forEach(l=>{const p=l.trim().split(/\s+/);if(p.length===2&&p[1]&&p[1].includes('.'))c[p[1]]=p[0]});fs.writeFileSync('server/data/qa-creds.json',JSON.stringify(c),'utf8');console.log('  -> qa credentials ready ('+Object.keys(c).length+' accounts)');"

Step 2 'Static checks (encoding + security scan)...'
node scripts/check-encoding.js
node scripts/security-scan.js | Select-Object -Last 2

Step 3 'Starting server...'
$env:RATE_LIMIT_DISABLED = 'true'
$proc = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server/index.js' `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $root 'server\data\server.out.log') `
    -RedirectStandardError (Join-Path $root 'server\data\server.err.log')
Start-Sleep -Seconds 2

$apiFail = 0
$linkFail = 0
try {
    Step 4 'API integration tests (47 checks)...'
    node server/scripts/test-api.js | Out-File -Encoding utf8 artifacts\verify-api.txt
    $text = Get-Content artifacts\verify-api.txt -Raw -Encoding UTF8
    $ok = ([regex]::Matches($text, [char]0x2713)).Count
    $bad = ([regex]::Matches($text, [char]0x2717)).Count
    Write-Output "  -> Passed: $ok | Failed: $bad"
    $apiFail = $bad

    Step 5 'Interconnection flow (16 steps)...'
    node server/scripts/smoke-interconnect.js | Out-File -Encoding utf8 artifacts\verify-interconnect.txt
    $text2 = Get-Content artifacts\verify-interconnect.txt -Raw -Encoding UTF8
    $ok2 = ([regex]::Matches($text2, [char]0x2713)).Count
    $bad2 = ([regex]::Matches($text2, [char]0x2717)).Count
    Write-Output "  -> Passed: $ok2 | Failed: $bad2"
    $linkFail = $bad2
}
finally {
    try { if ($proc -and !$proc.HasExited) { $proc.Kill() } } catch {}
    Remove-Item Env:\RATE_LIMIT_DISABLED -ErrorAction SilentlyContinue
}

Write-Output ""
Write-Output '==============================================='
if ($apiFail -eq 0 -and $linkFail -eq 0) {
    Write-Output '  RESULT: PASS - API and interconnection flows all green.'
}
else {
    Write-Output "  RESULT: FAIL - API failures: $apiFail, interconnection failures: $linkFail"
}
Write-Output '==============================================='
exit ($apiFail + $linkFail)
