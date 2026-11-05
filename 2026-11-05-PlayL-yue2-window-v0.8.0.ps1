param([switch]$Show)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $workspace '2026-11-04-PlayL-work-v0.1.0\2026-11-04-YuE2-portable-v0.1.0\YuE2-Studio.exe'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class PlayLYuEWindow {
    public delegate bool Callback(IntPtr hwnd, IntPtr data);
    [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr data);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd, int command);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hwnd);
    public static int Apply(uint pid, bool show) {
        int count = 0;
        EnumWindows((hwnd, _) => {
            uint owner; GetWindowThreadProcessId(hwnd, out owner);
            if (owner == pid && GetWindowTextLength(hwnd) > 0) {
                ShowWindowAsync(hwnd, show ? 5 : 0); count++;
            }
            return true;
        }, IntPtr.Zero);
        return count;
    }
}
"@
$count = 0
foreach ($process in Get-Process -Name 'YuE2-Studio' -ErrorAction SilentlyContinue) {
  if ($process.Path -eq $exe) { $count += [PlayLYuEWindow]::Apply($process.Id, $Show.IsPresent) }
}
if (!$count) { exit 2 }
