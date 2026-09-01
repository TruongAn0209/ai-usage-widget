// Bộ điều phối thuần Node cho đồng bộ hai chiều; không biết gì về Electron.
const SyncOrigin = Object.freeze({ TERMINAL: 'terminal', WIDGET: 'widget', USER_HOTKEY: 'user-hotkey' })

function createTerminalWidgetSync({ getTerminalState, setTerminalWindowState, log = () => {} }) {
  let terminalSyncDisabled = false
  let guard = null

  async function toggleWidget(currentlyVisible) {
    const target = currentlyVisible ? 'minimized' : 'visible'
    const terminal = await getTerminalState()
    if (terminal.state === 'closed' || terminalSyncDisabled) return { target, terminal, synced: false, origin: SyncOrigin.WIDGET }
    if ((target === 'minimized' && terminal.state === 'minimized') ||
        (target === 'visible' && terminal.state === 'visible')) {
      return { target, terminal, synced: false, origin: SyncOrigin.WIDGET }
    }
    // Truyền theo terminal vừa dò được: máy này có thể đang dùng Ghostty/iTerm chứ không
    // phải Terminal.app, điều khiển nhầm app là ẩn/hiện oan cửa sổ của người khác.
    const result = await setTerminalWindowState(target, terminal.target)
    if (!result.ok) {
      const appName = result.app || 'Terminal.app'
      if (result.permissionDenied) {
        terminalSyncDisabled = true
        log(`Không có quyền Automation điều khiển ${appName}; tạm tắt đồng bộ widget → terminal cho phiên này.`)
      } else if (result.unsupported) {
        // Ghostty (đo thật 01/09/2026) không cho automation thu nhỏ cửa sổ bằng bất kỳ đường nào.
        // Tắt hẳn chiều này thay vì thử lại vô ích mỗi lần bấm; chiều terminal → widget vẫn chạy.
        terminalSyncDisabled = true
        log(`${appName} không cho phép thu nhỏ cửa sổ bằng automation; chỉ đồng bộ một chiều terminal → widget.`)
      } else log(`Không thể đổi trạng thái ${appName}: ${result.error?.message || 'lỗi không xác định'}`)
      return { target, terminal, synced: false, origin: SyncOrigin.WIDGET, result }
    }
    guard = { expected: target, origin: SyncOrigin.WIDGET }
    return { target, terminal, synced: true, origin: SyncOrigin.WIDGET }
  }

  function consumeTerminalPoll(state) {
    if (guard && guard.expected === state.state) {
      const result = { ignored: true, origin: guard.origin }
      guard = null
      return result
    }
    return { ignored: false, origin: SyncOrigin.TERMINAL }
  }

  return {
    toggleWidget,
    consumeTerminalPoll,
    isTerminalSyncDisabled: () => terminalSyncDisabled,
    getGuard: () => guard,
  }
}

module.exports = { SyncOrigin, createTerminalWidgetSync }
