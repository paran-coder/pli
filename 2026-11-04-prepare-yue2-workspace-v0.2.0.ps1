param([string]$InstalledDirectory = (Join-Path $env:LOCALAPPDATA 'YuE2 Studio'))
$ErrorActionPreference = 'Stop'
$workspace = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$target = [System.IO.Path]::GetFullPath((Join-Path $workspace '2026-11-04-PlayL-work-v0.1.0\2026-11-04-YuE2-portable-v0.1.0'))
if (-not $target.StartsWith($workspace + [System.IO.Path]::DirectorySeparatorChar,[System.StringComparison]::OrdinalIgnoreCase)) { throw '작업 폴더 밖에는 복사하지 않습니다.' }
if (Test-Path -LiteralPath $target) {
  if (!(Test-Path -LiteralPath (Join-Path $target 'YuE2-Studio.exe'))) { throw '기존 프로젝트용 폴더의 실행 파일을 확인하세요.' }
  Write-Host '프로젝트용 폴더가 이미 있어 기존 파일을 사용합니다.'; return
}
foreach ($part in @('YuE2-Studio.exe','resources')) { if (-not (Test-Path -LiteralPath (Join-Path $InstalledDirectory $part))) { throw "기존 설치에서 필요한 항목을 찾을 수 없습니다: $part" } }
Write-Host "기존 엔진/모델을 새 폴더로 복사합니다: $target"
Write-Host '원본은 보존하며 모델 크기에 따라 수 GB의 추가 공간이 필요합니다.'
New-Item -ItemType Directory -Path $target | Out-Null
Copy-Item -LiteralPath (Join-Path $InstalledDirectory 'YuE2-Studio.exe') -Destination $target
Copy-Item -LiteralPath (Join-Path $InstalledDirectory 'resources') -Destination $target -Recurse
$data = New-Item -ItemType Directory -Path (Join-Path $target 'data')
if (Test-Path -LiteralPath (Join-Path $InstalledDirectory 'data\models')) {
  Copy-Item -LiteralPath (Join-Path $InstalledDirectory 'data\models') -Destination $data.FullName -Recurse
}
New-Item -ItemType File -Path (Join-Path $target 'portable.flag') -Value '' | Out-Null
New-Item -ItemType File -Path (Join-Path $data.FullName 'studio-settings.json') -Value '{"selected_profile_id":"quality-q8","cover_auto":false}' | Out-Null
Write-Host '준비했습니다. 프로젝트용 YuE2 실행 스크립트를 사용하세요.'
