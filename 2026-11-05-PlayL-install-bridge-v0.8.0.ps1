# 실행하면 현재 Windows 사용자에 PlayL 브릿지 열기 링크가 등록됩니다.
param([string]$OfficialWebOrigin)
$ErrorActionPreference = 'Stop'
if ($OfficialWebOrigin) {
  $uri = [uri]$OfficialWebOrigin
  if (!$uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or $uri.GetLeftPart([UriPartial]::Authority) -ne $OfficialWebOrigin) { throw 'HTTPS 웹앱 주소를 경로 없이 입력하세요.' }
  [Environment]::SetEnvironmentVariable('PLAYL_WEB_ORIGIN', $OfficialWebOrigin, 'User')
}
$pwsh = (Get-Command pwsh.exe).Source
$launcher = Join-Path $PSScriptRoot '2026-11-05-PlayL-protocol-start-v0.8.0.ps1'
$key = 'HKCU:\Software\Classes\playl-bridge'
New-Item -Path $key -Force | Out-Null
Set-Item -Path $key -Value 'URL:PlayL Bridge'
New-ItemProperty -Path $key -Name 'URL Protocol' -Value '' -Force | Out-Null
foreach ($part in @('shell','shell\open','shell\open\command')) {
  $command = New-Item -Path (Join-Path $key $part) -Force
}
Set-Item -Path $command.PSPath -Value ('"{0}" -NoProfile -WindowStyle Hidden -File "{1}"' -f $pwsh,$launcher)
Write-Host 'PlayL 웹앱에서 브릿지 연결을 눌러주세요.'
