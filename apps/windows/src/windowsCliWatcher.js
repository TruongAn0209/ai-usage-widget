// Phát hiện đúng trạng thái An cần trên Windows: có tiến trình `claude.exe` VÀ cửa sổ terminal
// THẬT đang hiện trên màn hình (không phải chỉ process còn sống). File thuần Node để kiểm thử
// được mà không cần mở Electron — mirror cấu trúc claudeCliWatcher.js của bản Mac.
const childProcess = require('child_process');
const path = require('path');

// Windows 11 đặt Windows Terminal làm terminal mặc định — cửa sổ THẬT người dùng nhìn thấy nằm ở
// đây. Thêm conhost/cmd/powershell/pwsh để không mất tác dụng nếu An đổi terminal mặc định về
// Windows Console Host (Settings > For developers > Terminal) thay vì dùng Windows Terminal.
const TERMINAL_PROCESS_NAMES = ['WindowsTerminal', 'conhost', 'cmd', 'powershell', 'pwsh'];
const CLAUDE_PROCESS_NAME = 'claude.exe';

// Ban dong goi chay tu app.asar (kho ao) — powershell.exe la TIEN TRINH NGOAI, khong doc duoc
// file nam trong app.asar (chi fs cua chinh Electron/Node moi "xuyen" duoc qua no). File .ps1
// PHAI duoc electron-builder tach ra ngoai qua "asarUnpack" (xem package.json) va nam that o
// app.asar.unpacked/... — o day doi lai duong dan cho khop, dung pattern chinh thuc cua Electron.
const RAW_SCRIPT_PATH = path.join(__dirname, 'windowsTerminalState.ps1');
const WINDOW_STATE_SCRIPT = RAW_SCRIPT_PATH.includes('app.asar' + path.sep)
  ? RAW_SCRIPT_PATH.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
  : RAW_SCRIPT_PATH;

function runFile(execFile, file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 6000, maxBuffer: 256 * 1024, windowsHide: true }, (error, stdout = '', stderr = '') => {
      resolve({ error, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function hasClaudeProcess(execFile = childProcess.execFile) {
  const result = await runFile(execFile, 'tasklist.exe', ['/FI', `IMAGENAME eq ${CLAUDE_PROCESS_NAME}`, '/NH', '/FO', 'CSV']);
  if (result.error) return false;
  return result.stdout.toLowerCase().includes(CLAUDE_PROCESS_NAME.toLowerCase());
}

// Claude Desktop is also named claude.exe, but its executable lives in the
// Windows Store package. Keep this separate from the CLI process check so the
// follow option can work with either app without requiring a terminal window.
async function hasClaudeDesktopProcess(execFile = childProcess.execFile) {
  const command = [
    "Add-Type @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class AiUsageForeground {',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);',
    '}',
    "'@",
    '$foregroundPid = 0;',
    '[AiUsageForeground]::GetWindowThreadProcessId([AiUsageForeground]::GetForegroundWindow(), [ref]$foregroundPid) | Out-Null',
    '$p = Get-Process -Id $foregroundPid -ErrorAction SilentlyContinue',
    "($null -ne $p -and $p.Path -like '*\\WindowsApps\\Claude_*' -and $p.MainWindowHandle -ne 0)",
  ].join('\n');
  const result = await runFile(execFile, 'powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    command,
  ]);
  if (result.error) return false;
  return result.stdout.trim().toLowerCase() === 'true';
}

// state: 'visible' | 'minimized' | 'closed' (that su khong co terminal nao chay)
//      | 'error' (script chay hong — KHONG suy ra la dong, de tang goi khong ep an/hien bay
//        widget sai vi 1 loi moi truong thoang qua, vd PowerShell bi chan tam thoi).
async function getTerminalState(execFile = childProcess.execFile, processNames = TERMINAL_PROCESS_NAMES) {
  const args = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    WINDOW_STATE_SCRIPT,
    '-ProcessNames',
    processNames.join(','),
  ];
  const result = await runFile(execFile, 'powershell.exe', args);
  if (result.error) return { state: 'error', error: result.error, stderr: result.stderr };
  const state = result.stdout.trim().toLowerCase();
  if (state === 'visible' || state === 'minimized' || state === 'closed') return { state };
  return { state: 'error', error: new Error('unexpected output: ' + result.stdout), stderr: result.stderr };
}

async function getClaudeCliState(execFile = childProcess.execFile) {
  const claude = await hasClaudeProcess(execFile);
  const terminal = await getTerminalState(execFile);
  return { claude, terminal };
}

// Active Claude surface for the widget follow option: Desktop is enough on its
// own; CLI still requires a visible terminal, preserving the old behavior.
async function getClaudeActivityState(execFile = childProcess.execFile) {
  const [desktop, cli] = await Promise.all([
    hasClaudeDesktopProcess(execFile),
    getClaudeCliState(execFile),
  ]);
  return {
    claude: desktop || cli.claude,
    desktop,
    terminal: desktop ? { state: 'visible' } : cli.terminal,
  };
}

async function isClaudeCliWithVisibleTerminal(execFile = childProcess.execFile) {
  const status = await getClaudeCliState(execFile);
  return status.claude && status.terminal.state === 'visible';
}

module.exports = {
  hasClaudeProcess,
  hasClaudeDesktopProcess,
  getTerminalState,
  getClaudeCliState,
  getClaudeActivityState,
  isClaudeCliWithVisibleTerminal,
  TERMINAL_PROCESS_NAMES,
  CLAUDE_PROCESS_NAME,
  WINDOW_STATE_SCRIPT,
};
