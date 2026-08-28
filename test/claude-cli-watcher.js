// Giả lập execFile để kiểm logic mà không phụ thuộc Terminal/Claude thật và không bật hộp quyền
// Automation của macOS trong lúc chạy unit test.
const path = require('path')
const { isClaudeCliWithVisibleTerminal, getTerminalState, getClaudeDesktopState, getClaudeWorkState, setTerminalWindowState, hasClaudeProcess } = require('../src/claudeCliWatcher')
const { createTerminalWidgetSync } = require('../src/terminalWidgetSync')

let failed = 0
function check(name, condition) {
  if (!condition) failed++
  console.log(`${condition ? '✅' : '❌'} ${name}`)
}

function mockExec({ claude, terminalRunning, frontmost = '', desktopRunning = false, desktopFrontmost = 'false', systemEventsFrontmost = '', visibleWindows }) {
  // Mặc định 1 cửa sổ hiện thật khi frontmost='true' — giữ tương thích các ca cũ chỉ quan tâm
  // frontmost. Ca nào cần mô phỏng "frontmost nhưng cửa sổ đã ở Dock" thì truyền visibleWindows
  // riêng (đúng bug thật đo được 02/08/2026: frontmost=true + visible=false,false,false).
  const windowsReply = visibleWindows !== undefined ? visibleWindows : (frontmost === 'true' ? 'true' : 'false')
  return (file, args, _options, callback) => {
    const command = path.basename(file)
    if (command === 'pgrep') {
      if (claude) callback(null, '12345\n', '')
      else callback(Object.assign(new Error('không tìm thấy'), { code: 1 }), '', '')
      return
    }
    if (command === 'osascript' && args[1].includes('is running')) {
      if (args[1].includes('"Claude"')) return callback(null, desktopRunning ? 'true\n' : 'false\n', '')
      callback(null, terminalRunning ? 'true\n' : 'false\n', '')
      return
    }
    if (command === 'osascript' && args[1].includes('tell application "Claude" to get frontmost')) {
      callback(null, desktopFrontmost + '\n', '')
      return
    }
    if (command === 'osascript' && args[1].includes('tell application "Terminal" to get frontmost')) {
      callback(null, frontmost + '\n', '')
      return
    }
    if (command === 'osascript' && args[1].includes('visible of every window')) {
      callback(null, windowsReply + '\n', '')
      return
    }
    if (command === 'osascript' && args[1].includes('System Events')) {
      callback(null, systemEventsFrontmost + '\n', '')
      return
    }
    callback(new Error('lệnh ngoài dự kiến: ' + command), '', '')
  }
}

async function run() {
  check('(a) claude chạy + Terminal hiện → true',
    await isClaudeCliWithVisibleTerminal(mockExec({ claude: true, terminalRunning: true, frontmost: 'true' })) === true)
  check('(b) claude chạy + Terminal không frontmost → false',
    await isClaudeCliWithVisibleTerminal(mockExec({ claude: true, terminalRunning: true, frontmost: 'false' })) === false)
  check('(c) claude không chạy → false',
    await isClaudeCliWithVisibleTerminal(mockExec({ claude: false, terminalRunning: true, frontmost: 'true' })) === false)
  check('(d) Terminal không chạy → false',
    await isClaudeCliWithVisibleTerminal(mockExec({ claude: true, terminalRunning: false })) === false)
  check('(m) Claude IDE đang được thao tác → visible',
    (await getClaudeDesktopState(mockExec({ desktopRunning: true, desktopFrontmost: 'true' }))).state === 'visible')
  check('(n) Claude IDE chạy nền → background',
    (await getClaudeDesktopState(mockExec({ desktopRunning: true, desktopFrontmost: 'false' }))).state === 'background')
  check('(o) CLI đang nền nhưng Claude IDE đang thao tác → widget vẫn hiện',
    (await getClaudeWorkState(mockExec({ claude: true, terminalRunning: true, frontmost: 'false', desktopRunning: true, desktopFrontmost: 'true' }))).active === true)
  check('(p) cả CLI lẫn IDE đều nền → widget ẩn',
    (await getClaudeWorkState(mockExec({ claude: true, terminalRunning: true, frontmost: 'false', desktopRunning: true, desktopFrontmost: 'false' }))).active === false)

  // Bug thật đo được 02/08/2026: tiến trình Claude Code trên máy này chạy dưới tên "Claude"
  // (viết hoa) chứ không phải "claude" — pgrep -x (phân biệt hoa/thường) không khớp, khiến
  // followClaudeCli không bao giờ hoạt động dù Terminal đang hiện đúng. Khoá lại bằng test.
  const psUppercaseClaudeExec = (file, args, _options, callback) => {
    const command = path.basename(file)
    if (command === 'pgrep') return callback(Object.assign(new Error('không tìm thấy'), { code: 1 }), '', '')
    if (command === 'ps') return callback(null, 'Finder\nClaude\nDock\n', '')
    callback(new Error('lệnh ngoài dự kiến: ' + command), '', '')
  }
  check('(i) pgrep không khớp nhưng ps thấy "Claude" viết hoa → vẫn true',
    await hasClaudeProcess(psUppercaseClaudeExec) === true)

  check('(e) phân biệt Terminal đang hiện',
    (await getTerminalState(mockExec({ terminalRunning: true, frontmost: 'true' }))).state === 'visible')
  check('(f) Terminal đang chạy nền, không do minimize → minimized',
    (await getTerminalState(mockExec({ terminalRunning: true, frontmost: 'false' }))).state === 'minimized')
  check('(g) phân biệt Terminal đã đóng',
    (await getTerminalState(mockExec({ terminalRunning: false }))).state === 'closed')
  check('(h) frontmost trực tiếp lỗi → dùng System Events',
    (await getTerminalState(mockExec({ terminalRunning: true, frontmost: 'không hợp lệ', systemEventsFrontmost: 'true', visibleWindows: 'true' }))).state === 'visible')

  // Ca hồi quy: Terminal xuống Dock nhưng macOS có thể vẫn báo frontmost.
  // thể giữ Terminal là app frontmost dù cửa sổ DUY NHẤT đã thu nhỏ xuống Dock — đo trực tiếp
  // trên máy này ra đúng frontmost=true + visible=false,false,false. Chỉ dựa frontmost là sai.
  check('(j) frontmost=true nhưng mọi cửa sổ đã ở Dock (visible=false hết) → minimized',
    (await getTerminalState(mockExec({ terminalRunning: true, frontmost: 'true', visibleWindows: 'false, false, false' }))).state === 'minimized')
  check('(k) frontmost=true và có 1 cửa sổ thật sự hiện → visible',
    (await getTerminalState(mockExec({ terminalRunning: true, frontmost: 'true', visibleWindows: 'false, true' }))).state === 'visible')
  check('(l) không frontmost thì khỏi cần hỏi cửa sổ (đỡ 1 lệnh osascript)', await (async () => {
    let windowsQueried = false
    const exec = (file, args, _options, callback) => {
      const command = path.basename(file)
      if (command === 'osascript' && args[1].includes('is running')) return callback(null, 'true\n', '')
      if (command === 'osascript' && args[1].includes('tell application "Terminal" to get frontmost')) return callback(null, 'false\n', '')
      if (command === 'osascript' && args[1].includes('visible of every window')) { windowsQueried = true; return callback(null, 'true\n', '') }
      callback(new Error('lệnh ngoài dự kiến'), '', '')
    }
    const result = await getTerminalState(exec)
    return result.state === 'minimized' && !windowsQueried
  })())

  const calls = []
  let terminalState = 'visible'
  const sync = createTerminalWidgetSync({
    getTerminalState: async () => ({ state: terminalState }),
    setTerminalWindowState: async (state) => { calls.push(state); terminalState = state; return { ok: true } },
  })
  let widgetVisible = true
  widgetVisible = false // (1) người dùng ẩn widget
  check('(1) Ẩn widget → Terminal thu nhỏ',
    (await sync.toggleWidget(true)).synced && calls.length === 1 && calls[0] === 'minimized')
  check('(2) poll sau khi ẩn không echo', sync.consumeTerminalPoll({ state: 'minimized' }).ignored)
  check('(3) poll lặp không gọi thừa', !sync.consumeTerminalPoll({ state: 'minimized' }).ignored && calls.length === 1)
  widgetVisible = true // (2) người dùng hiện widget
  check('(4) Hiện widget → Terminal hiện lại',
    (await sync.toggleWidget(false)).synced && calls.length === 2 && calls[1] === 'visible')
  check('(5) poll sau khi hiện không echo', sync.consumeTerminalPoll({ state: 'visible' }).ignored && calls.length === 2)

  terminalState = 'closed'
  check('(6) Terminal đóng → không điều khiển/relaunch',
    !(await sync.toggleWidget(widgetVisible)).synced && calls.length === 2)

  let permissionCalls = 0
  const permissionSync = createTerminalWidgetSync({
    getTerminalState: async () => ({ state: 'visible' }),
    setTerminalWindowState: async () => {
      permissionCalls++
      return { ok: false, permissionDenied: true, error: new Error('-1743 Not authorized') }
    },
  })
  await permissionSync.toggleWidget(true)
  await permissionSync.toggleWidget(true)
  check('(7) thiếu quyền Automation → tắt thử lại trong phiên', permissionCalls === 1 && permissionSync.isTerminalSyncDisabled())

  let actionCalls = 0
  const restoreExec = (file, args, _options, callback) => {
    if (args[1].includes('set miniaturized')) { actionCalls++; callback(null, '', ''); return }
    if (args[1].includes('activate')) { actionCalls++; callback(null, '', ''); return }
    callback(null, 'true\n', '')
  }
  const restore = await setTerminalWindowState('visible', restoreExec)
  check('(8) restore gồm un-minimize + activate', restore.ok && actionCalls === 2)

  if (failed) process.exit(1)
  console.log('\n✅ tất cả đạt')
}

run().catch((error) => { console.error(error); process.exit(1) })
