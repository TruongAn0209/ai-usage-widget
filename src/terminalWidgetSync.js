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
    const result = await setTerminalWindowState(target)
    if (!result.ok) {
      if (result.permissionDenied) {
        terminalSyncDisabled = true
        log('Không có quyền Automation điều khiển Terminal.app; tạm tắt đồng bộ widget → Terminal cho phiên này.')
      } else log(`Không thể đổi trạng thái Terminal.app: ${result.error?.message || 'lỗi không xác định'}`)
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
