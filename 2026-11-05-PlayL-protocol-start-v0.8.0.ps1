$ErrorActionPreference = 'Stop'
if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 43119 -State Listen -ErrorAction SilentlyContinue) { exit 0 }
$node = (Get-Command node.exe).Source
$official = [Environment]::GetEnvironmentVariable('PLAYL_WEB_ORIGIN', 'User')
if ($official) { $env:PLAYL_WEB_ORIGIN = $official }
Start-Process -FilePath $node -ArgumentList 'bridge/2026-11-04-server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
