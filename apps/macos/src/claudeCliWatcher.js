// Phát hiện trạng thái làm việc trên macOS: Claude Code trong terminal HOẶC Claude Desktop
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

// ── Nhiều terminal, không chỉ Terminal.app ──────────────────────────────────────────────────
// Bug thật 01/09/2026: An chuyển hẳn sang Ghostty, watcher chỉ hỏi `application "Terminal"` nên
// luôn ra `closed` ⇒ điều kiện hiện widget (`claude && terminal === 'visible'`) không bao giờ
// đúng ⇒ widget tự ẩn vĩnh viễn dù Claude Code đang chạy ngay trước mặt.
//
// Chỉ liệt kê TÊN; mọi khác biệt về khả năng scripting đều DÒ LÚC CHẠY chứ không nướng cứng —
// đo thật cho thấy Ghostty trả lời `is running`/`frontmost` nhưng ném lỗi -1728 với
// `visible of every window`, và không có cách nào đoán trước điều đó cho các terminal khác.
const KNOWN_TERMINAL_APPS = ['Terminal', 'iTerm2', 'iTerm', 'Ghostty', 'WezTerm', 'Alacritty', 'kitty', 'Warp', 'Hyper', 'Tabby']

// Tên tiến trình KHÁC tên app: Ghostty chạy dưới tên tiến trình `ghostty` (viết thường) — đúng
// loại bẫy đã cắn `pgrep -x claude` hồi 02/08/2026, nên mọi so khớp đều không phân biệt hoa/thường.
const DEFAULT_TERMINAL_TARGET = Object.freeze({ app: 'Terminal', process: 'Terminal' })

// Một lệnh osascript lấy CẢ app đang frontmost lẫn danh sách app có giao diện. Gộp lại để nhịp
// poll 8 giây không phải bắn 10 lệnh "app X is running" cho từng terminal trong danh mục.
const DESKTOP_SNAPSHOT_SCRIPT = [
  'tell application "System Events"',
  "set AppleScript's text item delimiters to \",\"",
  'set fm to ""',
  'try',
  'set fm to name of first application process whose frontmost is true',
  'end try',
  'set procs to name of every application process whose background only is false',
  'return fm & "|" & (procs as text)',
  'end tell',
].join('\n')

function axMinimizedScript(processName) {
  return `tell application "System Events" to get value of attribute "AXMinimized" of every window of application process "${processName}"`
}

function axAppVisibleScript(processName) {
  return `tell application "System Events" to get visible of application process "${processName}"`
}

function appVisibleWindowsScript(appName) {
  return `tell application "${appName}" to get visible of every window`
}

function appActivateScript(appName) {
  return `tell application "${appName}" to activate`
}

function appMinimizeScript(appName) {
  return `tell application "${appName}" to set miniaturized of every window to true`
}

function appRestoreScript(appName) {
  return `tell application "${appName}" to set miniaturized of every window to false`
}

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

// Đường CŨ, chỉ biết Terminal.app. Giữ nguyên làm lưới an toàn: khi ảnh chụp System Events lỗi
// (thiếu quyền Accessibility, macOS đổi API...) thì hành vi tụt về đúng như trước chứ không gãy.
async function getTerminalStateLegacy(execFile = childProcess.execFile) {
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

async function getDesktopSnapshot(execFile) {
  const snapshot = await runFile(execFile, '/usr/bin/osascript', ['-e', DESKTOP_SNAPSHOT_SCRIPT])
  // Dấu `|` là chữ ký của ảnh chụp hợp lệ. Thiếu nó nghĩa là lệnh lỗi hoặc trả về thứ khác —
  // tầng gọi phải tụt về đường Terminal.app cũ thay vì kết luận "không có terminal nào".
  if (snapshot.error || !snapshot.stdout.includes('|')) {
    return { ok: false, error: snapshot.error, stderr: snapshot.stderr }
  }
  const [frontmostRaw, procsRaw = ''] = snapshot.stdout.trim().split('|')
  return {
    ok: true,
    frontmost: frontmostRaw.trim(),
    processes: procsRaw.split(',').map((name) => name.trim()).filter(Boolean),
  }
}

function matchKnownTerminal(processName) {
  const lowered = processName.toLowerCase()
  const app = KNOWN_TERMINAL_APPS.find((name) => name.toLowerCase() === lowered)
  return app ? { app, process: processName } : null
}

function findRunningTerminals(snapshot) {
  return snapshot.processes.map(matchKnownTerminal).filter(Boolean)
}

// Cửa sổ của terminal này có đang thật sự hiện trên màn hình không.
// Thử scripting của chính app trước (Terminal/iTerm trả lời được, rẻ và chính xác nhất); app nào
// ném lỗi -1728 vì không expose cửa sổ (đo thật: Ghostty) thì hỏi vòng qua System Events.
async function hasVisibleWindowFor(target, execFile) {
  const viaApp = await runFile(execFile, '/usr/bin/osascript', ['-e', appVisibleWindowsScript(target.app)])
  if (!viaApp.error) {
    const values = viaApp.stdout.trim().toLowerCase().split(/\s*,\s*/).filter(Boolean)
    if (values.length) return { ok: true, value: values.includes('true') }
  }

  // Cmd+H (ẩn cả app) không đụng tới AXMinimized, nên phải hỏi riêng — thiếu bước này thì app
  // đang bị ẩn vẫn bị coi là đang hiện.
  const appVisible = await runFile(execFile, '/usr/bin/osascript', ['-e', axAppVisibleScript(target.process)])
  if (!appVisible.error && appVisible.stdout.trim().toLowerCase() === 'false') return { ok: true, value: false }

  const minimized = await runFile(execFile, '/usr/bin/osascript', ['-e', axMinimizedScript(target.process)])
  if (minimized.error) return { ok: false, error: minimized.error, stderr: minimized.stderr }
  const values = minimized.stdout.trim().toLowerCase().split(/\s*,\s*/).filter(Boolean)
  // Không còn cửa sổ nào ⇒ không có gì trên màn hình. Còn ít nhất một cửa sổ chưa thu nhỏ ⇒ hiện.
  if (!values.length) return { ok: true, value: false }
  return { ok: true, value: values.includes('false') }
}

async function getTerminalState(execFile = childProcess.execFile) {
  const snapshot = await getDesktopSnapshot(execFile)
  if (!snapshot.ok) return getTerminalStateLegacy(execFile)

  const terminals = findRunningTerminals(snapshot)
  if (!terminals.length) return { state: 'closed' }

  const frontmostLower = snapshot.frontmost.toLowerCase()
  const active = terminals.find((target) => target.process.toLowerCase() === frontmostLower)
  // Không terminal nào đang là app active ⇒ An đang làm việc ở app khác, y hệt luật cũ.
  // Vẫn trả về một terminal để chiều widget → terminal biết cần điều khiển ai khi hiện lại.
  if (!active) return { state: 'minimized', target: terminals[0] }

  const windows = await hasVisibleWindowFor(active, execFile)
  // Hỏi cửa sổ mà lỗi thì tin frontmost, đừng ẩn oan — giữ đúng tinh thần bản cũ.
  if (!windows.ok) return { state: 'visible', target: active, error: windows.error, stderr: windows.stderr }
  return { state: windows.value ? 'visible' : 'minimized', target: active }
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

async function setTerminalWindowState(state, execFile = childProcess.execFile, target = DEFAULT_TERMINAL_TARGET) {
  const app = target?.app || DEFAULT_TERMINAL_TARGET.app
  const script = state === 'minimized' ? appMinimizeScript(app) : appRestoreScript(app)
  const changed = await runFile(execFile, '/usr/bin/osascript', ['-e', script])
  if (changed.error) {
    if (isAutomationPermissionError(changed)) {
      return { ok: false, permissionDenied: true, app, error: changed.error, stderr: changed.stderr }
    }
    // Đo thật 01/09/2026 trên Ghostty: cả ba đường đều không thu nhỏ được cửa sổ — set
    // `AXMinimized` bị nuốt lặng lẽ, `AXMinimizeButton` không đọc nổi value, Cmd+M không ăn.
    // Terminal kiểu này chỉ đồng bộ được MỘT chiều (terminal → widget); nói thẳng ra bằng cờ
    // `unsupported` để tầng trên tắt hẳn chiều ngược lại thay vì thử lại vô ích mỗi lần bấm.
    if (state === 'minimized') {
      return { ok: false, unsupported: true, app, error: changed.error, stderr: changed.stderr }
    }
    // Hiện lại thì `activate` là đủ và chạy được với mọi terminal đã đo, kể cả Ghostty.
  }
  if (state === 'visible') {
    const activated = await runFile(execFile, '/usr/bin/osascript', ['-e', appActivateScript(app)])
    if (activated.error) return { ok: false, permissionDenied: isAutomationPermissionError(activated), app, error: activated.error, stderr: activated.stderr }
  }
  return { ok: true, app }
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
  getTerminalStateLegacy,
  getDesktopSnapshot,
  findRunningTerminals,
  getClaudeCliState,
  getClaudeDesktopState,
  getClaudeWorkState,
  setTerminalWindowState,
  isAutomationPermissionError,
  isClaudeCliWithVisibleTerminal,
  KNOWN_TERMINAL_APPS,
  DEFAULT_TERMINAL_TARGET,
  DESKTOP_SNAPSHOT_SCRIPT,
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
