$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$root = Join-Path $workspace '2026-11-04-PlayL-work-v0.1.0\2026-11-04-YuE2-portable-v0.1.0'
$exe = Join-Path $root 'YuE2-Studio.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw '프로젝트용 YuE2 복사본이 없습니다. 설치 안내를 먼저 확인하세요.' }
$temporary = Join-Path $root 'temp'
New-Item -ItemType Directory -Path $temporary -Force | Out-Null
$environment = @{
  YUE_STUDIO_DATA_ROOT = (Join-Path $root 'data')
  YUE_STUDIO_SETTINGS_PATH = (Join-Path $root 'data\studio-settings.json')
  YUE_MODELS_ROOT = (Join-Path $root 'data\models\yue2-cpp')
  WEBVIEW2_USER_DATA_FOLDER = (Join-Path $root 'webview-data')
  TEMP = $temporary
  TMP = $temporary
}
Start-Process -FilePath $exe -WorkingDirectory $root -Environment $environment -WindowStyle Hidden
Write-Host '프로젝트용 YuE2를 실행했습니다. PlayL에서 연결 확인을 누르세요.'
Write-Host '기존 설치본이 같은 MCP 포트를 사용 중이면 생성은 실행하지 말고 기존 창을 먼저 닫으세요.'
