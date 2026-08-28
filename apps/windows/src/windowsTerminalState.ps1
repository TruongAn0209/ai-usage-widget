# Tra ve dung 1 trong 3 chu: visible | minimized | closed
#
# Vi sao khong the chi kiem cua so cua chinh tien trinh claude.exe: ConPTY (co che Windows Terminal
# dung de host console app) van tao 1 "cua so console" rieng cho claude.exe de tuong thich API cu,
# nhung cua so do KHONG BAO GIO duoc ve len man hinh that — no bao IsWindowVisible=true DU
# WindowsTerminal dang bi thu nho xuong taskbar (do that 05/08/2026 tren may nay: claude.exe bao
# visible=true trong luc WindowsTerminal.exe moi la noi thuc su ve man hinh). Vi vay script nay
# CHI kiem cua so cua chinh app terminal (tham so -ProcessNames), khong bao gio kiem cua so cua
# claude.exe.
param(
  [string]$ProcessNames = 'WindowsTerminal'
)

$ErrorActionPreference = 'Stop'

$names = $ProcessNames -split ',' | Where-Object { $_ -and $_.Trim() -ne '' } | ForEach-Object { $_.Trim() }

$targetProcs = @()
foreach ($n in $names) {
  $targetProcs += Get-Process -Name $n -ErrorAction SilentlyContinue
}

if (-not $targetProcs -or $targetProcs.Count -eq 0) {
  Write-Output 'closed'
  exit 0
}

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class AiUsageTerminalWinState {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@

$targetPids = New-Object 'System.Collections.Generic.HashSet[uint32]'
foreach ($p in $targetProcs) { [void]$targetPids.Add([uint32]$p.Id) }

$foregroundPid = 0
[AiUsageTerminalWinState]::GetWindowThreadProcessId([AiUsageTerminalWinState]::GetForegroundWindow(), [ref]$foregroundPid) | Out-Null

$script:anyVisible = $false

# Cua so that su dang tren man hinh: thuoc 1 trong cac PID muc tieu, co tieu de (loai cua so
# phu tro an nhu IME/DDE khong ai nhin thay), VISIBLE va KHONG bi thu nho (IsIconic).
$callback = {
  param($hWnd, $lParam)
  $len = [AiUsageTerminalWinState]::GetWindowTextLength($hWnd)
  if ($len -gt 0) {
    $wpid = 0
    [AiUsageTerminalWinState]::GetWindowThreadProcessId($hWnd, [ref]$wpid) | Out-Null
    # Chi coi la terminal la dang lam viec neu no dang la cua so foreground.
    # Neu nguoi dung chuyen sang app khac, widget phai an ngay o lan poll tiep theo.
    if ($targetPids.Contains([uint32]$wpid) -and [uint32]$wpid -eq [uint32]$foregroundPid) {
      if ([AiUsageTerminalWinState]::IsWindowVisible($hWnd) -and -not [AiUsageTerminalWinState]::IsIconic($hWnd)) {
        $script:anyVisible = $true
      }
    }
  }
  return $true
}

[AiUsageTerminalWinState]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null

if ($script:anyVisible) { Write-Output 'visible' } else { Write-Output 'minimized' }
