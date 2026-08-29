// Kiểm kiểu + giới hạn cấu hình TRƯỚC khi ghi đĩa hoặc áp cho cửa sổ.
//
// ★ VÌ SAO CẦN FILE NÀY: main.js nhận `patch` thẳng từ renderer (trang Cài đặt) qua IPC, và
//   `loadConfig()` parse thẳng file JSON trên đĩa — cả hai đường đều có thể mang giá trị sai kiểu
//   (`disabledProviders: null`, `width: "abc"`, chiều cao renderer cực lớn do bug hiển thị) và làm
//   hỏng hình học cửa sổ hoặc crash lúc render (codex soi ra 02/08). Hàm ở đây là NGUỒN DUY NHẤT
//   quyết định khoá nào hợp lệ, ép kiểu, kẹp khoảng — dùng chung cho cả `loadConfig` lẫn `set-config`.
//
// Thuần Node, không đụng Electron → test được trực tiếp (xem test/config-schema.js), giống cách
// usageTracker.js xuất `contextLimitFor` ra ngoài để test/context-limit.js kiểm không cần Electron.
const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const LAYOUTS = ['bars', 'rings', 'strip', 'dashboard', 'terminal']
const PALETTES = ['espresso', 'dark', 'light', 'default', 'catppuccin', 'dracula', 'nord', 'gruvbox']
const LANGS = ['auto', 'vi', 'en']

function num(v, lo, hi, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}
function pickEnum(v, list, fallback) {
  return list.includes(v) ? v : fallback
}
function bool(v, fallback) {
  return typeof v === 'boolean' ? v : fallback
}
function strArray(v, fallback) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : fallback
}

// 'auto' hoặc chuỗi số dương — input HTML gửi chuỗi, không ép thành number (xem usageTracker.js).
function sanitizeContextLimit(v, fallback) {
  if (v === 'auto') return 'auto'
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? String(n) : fallback
}

// null hoặc {x, y} số hữu hạn. Kẹp vào vùng nhìn thấy là việc của main.js (clampToVisibleArea) —
// ở đây chỉ chặn kiểu sai (NaN, thiếu trục, object lạ) làm setBounds() ném lỗi.
function sanitizeCustomPosition(v, fallback) {
  if (v === null) return null
  if (v && Number.isFinite(Number(v.x)) && Number.isFinite(Number(v.y))) {
    return { x: Number(v.x), y: Number(v.y) }
  }
  return fallback
}

// Chỉ nhận đúng các khoá đã biết (allowlist) — khoá lạ trong patch bị bỏ qua ÂM THẦM, không ném
// lỗi (một khoá thừa/gõ nhầm không được phép làm mất luôn các khoá hợp lệ khác trong cùng patch).
function sanitizeConfig(patch, base) {
  const p = patch && typeof patch === 'object' ? patch : {}
  const out = {}
  if ('lang' in p) out.lang = pickEnum(p.lang, LANGS, base.lang)
  if ('corner' in p) out.corner = pickEnum(p.corner, CORNERS, base.corner)
  if ('customPosition' in p) out.customPosition = sanitizeCustomPosition(p.customPosition, base.customPosition)
  if ('palette' in p) out.palette = pickEnum(p.palette, PALETTES, base.palette)
  if ('layout' in p) out.layout = pickEnum(p.layout, LAYOUTS, base.layout)
  if ('compact' in p) out.compact = bool(p.compact, base.compact)
  if ('opacity' in p) out.opacity = num(p.opacity, 0.15, 1, base.opacity)
  if ('hoverBoost' in p) out.hoverBoost = bool(p.hoverBoost, base.hoverBoost)
  if ('width' in p) out.width = num(p.width, 200, 460, base.width)
  if ('showForecast' in p) out.showForecast = bool(p.showForecast, base.showForecast)
  if ('disabledProviders' in p) out.disabledProviders = strArray(p.disabledProviders, base.disabledProviders)
  if ('launchAtLogin' in p) out.launchAtLogin = bool(p.launchAtLogin, base.launchAtLogin)
  if ('alwaysOnTop' in p) out.alwaysOnTop = bool(p.alwaysOnTop, base.alwaysOnTop)
  if ('followClaudeCli' in p) out.followClaudeCli = bool(p.followClaudeCli, base.followClaudeCli)
  if ('locked' in p) out.locked = bool(p.locked, base.locked)
  if ('providerOrder' in p) out.providerOrder = strArray(p.providerOrder, base.providerOrder)
  if ('topMetricOnly' in p) out.topMetricOnly = bool(p.topMetricOnly, base.topMetricOnly)
  if ('refreshApiMs' in p) out.refreshApiMs = num(p.refreshApiMs, 180000, 3600000, base.refreshApiMs)
  if ('refreshLocalMs' in p) out.refreshLocalMs = num(p.refreshLocalMs, 2000, 120000, base.refreshLocalMs)
  if ('refreshLocalProvidersMs' in p) out.refreshLocalProvidersMs = num(p.refreshLocalProvidersMs, 5000, 60000, base.refreshLocalProvidersMs)
  if ('alertsEnabled' in p) out.alertsEnabled = bool(p.alertsEnabled, base.alertsEnabled)
  if ('alertWarnPct' in p) out.alertWarnPct = num(p.alertWarnPct, 1, 99, base.alertWarnPct)
  if ('alertCritPct' in p) out.alertCritPct = num(p.alertCritPct, 2, 100, base.alertCritPct)
  if ('hotkey' in p) out.hotkey = typeof p.hotkey === 'string' ? p.hotkey.trim() : base.hotkey
  if ('showContext' in p) out.showContext = bool(p.showContext, base.showContext)
  if ('contextLimit' in p) out.contextLimit = sanitizeContextLimit(p.contextLimit, base.contextLimit)

  // Quan hệ warn < crit — 2 mức trùng hoặc đảo ngược thì cảnh báo vàng/đỏ bắn lẫn lộn. Chỉ đẩy
  // khoá KHÔNG NẰM trong patch — đổi đúng khoá người dùng vừa đặt thì phải giữ, dịch khoá còn lại.
  const warnChanged = 'alertWarnPct' in out
  const critChanged = 'alertCritPct' in out
  const warn = warnChanged ? out.alertWarnPct : base.alertWarnPct
  const crit = critChanged ? out.alertCritPct : base.alertCritPct
  if ((warnChanged || critChanged) && warn >= crit) {
    if (critChanged && !warnChanged) out.alertWarnPct = Math.max(1, Math.min(warn, crit - 1))
    else out.alertCritPct = Math.min(100, Math.max(crit, warn + 1))
  }
  return out
}

module.exports = { sanitizeConfig, CORNERS, LAYOUTS, PALETTES, LANGS }
