// Phát hiện trạng thái làm việc trên macOS: Claude Code trong Terminal HOẶC Claude Desktop
// (nơi mở IDE). File thuần Node để kiểm thử được mà không cần mở Electron.
const childProcess = require('child_process')
const path = require('path')

// Cú pháp `is running` không khởi chạy Terminal và không cần điều khiển thêm System Events.
const TERMINAL_RUNNING_SCRIPT = 'application "Terminal" is running'
const TERMINAL_FRONTMOST_SCRIPT = 'tell application "Terminal" to get frontmost'
const TERMINAL_SYSTEM_EVENTS_FRONTMOST_SCRIPT = 'tell application "System Events" to get frontmost of application process "Terminal"'
// `frontmost` CHỈ nói app Terminal có đang là app đang active không — khi thu nhỏ cửa sổ DUY
// NHẤT xuống Dock, macOS vẫn có thể giữ Terminal là app active (chưa ai bấm sang app khác) nên
// `frontmost` vẫn `true` dù không còn cửa sổ nào trên màn hình. Đã đo thật 02/08/2026: cùng lúc
// `frontmost = true` và `visible of every window = false, false, false`. Vì vậy bắt buộc kiểm
// THÊM còn cửa sổ nào thật sự hiện trên màn hình không — dùng `visible` (không dùng lại
// `miniaturized` vì đó là nguyên nhân bug full-màn-hình ở bản trước).
const TERMINAL_VISIBLE_WINDOWS_SCRIPT = 'tell application "Terminal" to get visible of every window'
const TERMINAL_MINIMIZE_SCRIPT = 'tell application "Terminal" to set miniaturized of every window to true'
const TERMINAL_RESTORE_SCRIPT = 'tell application "Terminal" to set miniaturized of every window to false'
const TERMINAL_ACTIVATE_SCRIPT = 'tell application "Terminal" to activate'
const CLAUDE_DESKTOP_RUNNING_SCRIPT = 'application "Claude" is running'
const CLAUDE_DESKTOP_FRONTMOST_SCRIPT = 'tell application "Claude" to get frontmost'

function runFile(execFile, file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 5000, maxBuffer: 64 * 1024 }, (error, stdout = '', stderr = '') => {
      resolve({ error, stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

async function hasClaudeProcess(execFile = childProcess.execFile) {
  // Đã đo thật 02/08/2026: trên máy này tiến trình Claude Code chạy dưới tên "Claude"
  // (viết hoa), không phải "claude" — `pgrep -x claude` (phân biệt hoa/thường) không bao giờ
  // khớp, khiến followClaudeCli không hoạt động ngay từ gốc dù trước đó tưởng chỉ lỗi
  // frontmost/minimize. Dò không phân biệt hoa/thường và luôn đối chiếu thêm qua `ps` (không
  // chỉ khi pgrep lỗi) để không bỏ sót tên tiến trình khác biệt giữa các bản build.
  const pgrep = await runFile(execFile, '/usr/bin/pgrep', ['-ix', 'claude'])
  if (!pgrep.error && pgrep.stdout.trim().length > 0) return true

  const ps = await runFile(execFile, '/bin/ps', ['-axo', 'comm'])
  if (ps.error) return false
  return ps.stdout.split(/\r?\n/).some((line) => path.basename(line.trim()).toLowerCase() === 'claude')
}

async function hasVisibleTerminalWindow(execFile = childProcess.execFile) {
  return (await getTerminalState(execFile)).state === 'visible'
}

async function isTerminalFrontmost(execFile) {
  const frontmost = await runFile(execFile, '/usr/bin/osascript', ['-e', TERMINAL_FRONTMOST_SCRIPT])
  const directValue = frontmost.stdout.trim().toLowerCase()
  if (!frontmost.error && (directValue === 'true' || directValue === 'false')) {
    return { ok: true, value: directValue === 'true' }
  }

  // Một số bản macOS/Terminal có thể không hỗ trợ thuộc tính frontmost trên app.
  // Khi đó thử System Events; lỗi quyền được trả về để tầng gọi xử lý như trước.
  const systemEvents = await runFile(execFile, '/usr/bin/osascript', ['-e', TERMINAL_SYSTEM_EVENTS_FRONTMOST_SCRIPT])
  const systemEventsValue = systemEvents.stdout.trim().toLowerCase()
  if (!systemEvents.error && (systemEventsValue === 'true' || systemEventsValue === 'false')) {
    return { ok: true, value: systemEventsValue === 'true' }
  }
  return {
    ok: false,
    error: systemEvents.error || frontmost.error,
    stderr: [frontmost.stderr, systemEvents.stderr].filter(Boolean).join('\n'),
  }
}

async function hasVisibleTerminalWindowNow(execFile) {
  const windows = await runFile(execFile, '/usr/bin/osascript', ['-e', TERMINAL_VISIBLE_WINDOWS_SCRIPT])
  if (windows.error) return { ok: false, error: windows.error, stderr: windows.stderr }
  const values = windows.stdout.trim().toLowerCase().split(/\s*,\s*/).filter(Boolean)
  return { ok: true, value: values.includes('true') }
}

async function getTerminalState(execFile = childProcess.execFile) {
  const running = await runFile(execFile, '/usr/bin/osascript', ['-e', TERMINAL_RUNNING_SCRIPT])
  if (running.error || running.stdout.trim().toLowerCase() !== 'true') {
    return { state: 'closed', error: running.error, stderr: running.stderr }
  }

  const frontmost = await isTerminalFrontmost(execFile)
  if (!frontmost.ok) return { state: 'minimized', error: frontmost.error, stderr: frontmost.stderr }
  // Không frontmost thì chắc chắn không phải cửa sổ đang làm việc — khỏi cần hỏi thêm cửa sổ.
  if (!frontmost.value) return { state: 'minimized' }

  // Frontmost rồi vẫn phải hỏi thêm: app có thể vẫn "đang active" dù cửa sổ DUY NHẤT đã thu
  // nhỏ xuống Dock (đo thật 02/08/2026). Lỗi ở bước này thì tin frontmost, đừng ẩn oan.
  const windows = await hasVisibleTerminalWindowNow(execFile)
  if (!windows.ok) return { state: 'visible', error: windows.error, stderr: windows.stderr }
  return { state: windows.value ? 'visible' : 'minimized' }
}

// Claude Desktop là nơi Claude Code mở IDE trên máy này. Không dùng `pgrep Claude`: tiến trình
// CLI cũng có thể mang tên Claude, nên chỉ AppleScript theo application bundle mới phân biệt được.
async function getClaudeDesktopState(execFile = childProcess.execFile) {
  const running = await runFile(execFile, '/usr/bin/osascript', ['-e', CLAUDE_DESKTOP_RUNNING_SCRIPT])
  if (running.error || running.stdout.trim().toLowerCase() !== 'true') {
    return { state: 'closed', error: running.error, stderr: running.stderr }
  }
  const frontmost = await runFile(execFile, '/usr/bin/osascript', ['-e', CLAUDE_DESKTOP_FRONTMOST_SCRIPT])
  const value = frontmost.stdout.trim().toLowerCase()
  if (!frontmost.error && (value === 'true' || value === 'false')) return { state: value === 'true' ? 'visible' : 'background' }
  // Không ẩn oan khi macOS từ chối truy vấn frontmost. Lỗi này chỉ ảnh hưởng luật tự ẩn, không
  // được phép làm widget biến mất trong lúc Claude Desktop vẫn đang chạy.
  return { state: 'visible', error: frontmost.error, stderr: frontmost.stderr }
}

function isAutomationPermissionError(result) {
  const text = [result?.error?.message, result?.stderr, result?.stdout].filter(Boolean).join(' ').toLowerCase()
  return result?.error?.code === -1743 || text.includes('not authorized') || text.includes('không được phép')
}

async function setTerminalWindowState(state, execFile = childProcess.execFile) {
  const script = state === 'minimized' ? TERMINAL_MINIMIZE_SCRIPT : TERMINAL_RESTORE_SCRIPT
  const changed = await runFile(execFile, '/usr/bin/osascript', ['-e', script])
  if (changed.error) return { ok: false, permissionDenied: isAutomationPermissionError(changed), error: changed.error, stderr: changed.stderr }
  if (state === 'visible') {
    const activated = await runFile(execFile, '/usr/bin/osascript', ['-e', TERMINAL_ACTIVATE_SCRIPT])
    if (activated.error) return { ok: false, permissionDenied: isAutomationPermissionError(activated), error: activated.error, stderr: activated.stderr }
  }
  return { ok: true }
}

async function getClaudeCliState(execFile = childProcess.execFile) {
  const claude = await hasClaudeProcess(execFile)
  const terminal = await getTerminalState(execFile)
  return { claude, terminal }
}

async function getClaudeWorkState(execFile = childProcess.execFile) {
  const [cli, desktop] = await Promise.all([getClaudeCliState(execFile), getClaudeDesktopState(execFile)])
  return { cli, desktop, active: (cli.claude && cli.terminal.state === 'visible') || desktop.state === 'visible' }
}

async function isClaudeCliWithVisibleTerminal(execFile = childProcess.execFile) {
  const status = await getClaudeCliState(execFile)
  return status.claude && status.terminal.state === 'visible'
}

module.exports = {
  hasClaudeProcess,
  hasVisibleTerminalWindow,
  getTerminalState,
  getClaudeCliState,
  getClaudeDesktopState,
  getClaudeWorkState,
  setTerminalWindowState,
  isAutomationPermissionError,
  isClaudeCliWithVisibleTerminal,
  TERMINAL_RUNNING_SCRIPT,
  TERMINAL_FRONTMOST_SCRIPT,
  TERMINAL_SYSTEM_EVENTS_FRONTMOST_SCRIPT,
  TERMINAL_VISIBLE_WINDOWS_SCRIPT,
  TERMINAL_MINIMIZE_SCRIPT,
  TERMINAL_RESTORE_SCRIPT,
  TERMINAL_ACTIVATE_SCRIPT,
  CLAUDE_DESKTOP_RUNNING_SCRIPT,
  CLAUDE_DESKTOP_FRONTMOST_SCRIPT,
}
