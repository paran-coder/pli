param([Parameter(Mandatory)][string]$Origin)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$result = [System.Windows.Forms.MessageBox]::Show(
  "이 웹앱에 PlayL의 로컬 작업 접근을 허용할까요?`n`n$Origin",
  'PlayL 브릿지 연결 요청',
  [System.Windows.Forms.MessageBoxButtons]::YesNo,
  [System.Windows.Forms.MessageBoxIcon]::Question,
  [System.Windows.Forms.MessageBoxDefaultButton]::Button2
)
if ($result -eq [System.Windows.Forms.DialogResult]::Yes) { exit 0 }
exit 1
