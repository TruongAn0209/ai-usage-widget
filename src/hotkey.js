function trySwapHotkey(shortcut, callback, newHotkey, oldHotkey) {
  if (newHotkey === oldHotkey) return true
  if (!newHotkey) {
    if (oldHotkey) {
      try { shortcut.unregister(oldHotkey) } catch { /* bỏ qua */ }
    }
    return true
  }
  let ok
  try { ok = shortcut.register(newHotkey, callback) } catch { ok = false }
  if (!ok) return false
  if (oldHotkey) {
    try { shortcut.unregister(oldHotkey) } catch { /* bỏ qua */ }
  }
  return true
}

module.exports = { trySwapHotkey }
