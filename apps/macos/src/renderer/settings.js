// Cài đặt ÁP DỤNG TRỰC TIẾP: đổi là widget đổi ngay và tự lưu — không có nút "Lưu".
// Nút còn lại chỉ là "Khôi phục mặc định" và "Làm mới ngay".
const $ = (id) => document.getElementById(id)
const FIELDS = ['layout', 'palette', 'compact', 'opacity', 'hoverBoost', 'width', 'showContext',
  'contextLimit', 'showForecast', 'topMetricOnly', 'alertsEnabled', 'alertWarnPct', 'alertCritPct',
  'alwaysOnTop', 'locked', 'launchAtLogin', 'followClaudeCli', 'hotkey']

// mục "2 giao diện Cài đặt": công tắc Gọn/Đủ chỉ đổi LỚP HIỂN THỊ (ẩn/hiện .adv), không đụng
// cấu hình widget — lưu sở thích riêng của cửa sổ Cài đặt bằng localStorage, không ghi config.json.
const MODE_KEY = 'settingsMode'
function applyMode(mode) {
  document.body.classList.toggle('settings-full', mode === 'full')
  $('modeCompact').setAttribute('aria-selected', String(mode !== 'full'))
  $('modeFull').setAttribute('aria-selected', String(mode === 'full'))
}
function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode)
  applyMode(mode)
}
$('modeCompact').addEventListener('click', () => setMode('compact'))
$('modeFull').addEventListener('click', () => setMode('full'))
applyMode(localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'compact')

// mục 12: preset gộp sẵn vài lựa chọn hay dùng thành 1 cú bấm — patch nhiều khoá 1 lượt.
const PRESETS = {
  full: { compact: false, topMetricOnly: false, layout: 'dashboard', showForecast: true, showContext: true },
  compact: { compact: true, topMetricOnly: true, layout: 'strip', showForecast: false, showContext: false },
  work: { compact: false, topMetricOnly: true, layout: 'bars', showForecast: true, showContext: true },
}

function showOpacity() { $('opacityVal').textContent = Math.round(Number($('opacity').value) * 100) + '%' }

function fill(cfg) {
  $('layout').value = cfg.layout || 'bars'
  $('compact').checked = !!cfg.compact
  $('showForecast').checked = cfg.showForecast !== false
  $('topMetricOnly').checked = !!cfg.topMetricOnly
  $('palette').value = cfg.palette
  $('opacity').value = cfg.opacity
  $('hoverBoost').checked = cfg.hoverBoost !== false
  showOpacity()
  $('width').value = cfg.width
  $('showContext').checked = !!cfg.showContext
  $('contextLimit').value = String(cfg.contextLimit ?? 'auto')
  $('alertsEnabled').checked = !!cfg.alertsEnabled
  $('alertWarnPct').value = cfg.alertWarnPct
  $('alertCritPct').value = cfg.alertCritPct
  $('alwaysOnTop').checked = cfg.alwaysOnTop !== false
  $('locked').checked = !!cfg.locked
  $('launchAtLogin').checked = !!cfg.launchAtLogin
  $('followClaudeCli').checked = !!cfg.followClaudeCli
  $('hotkey').value = cfg.hotkey || ''
  $('refreshApiSec').value = Math.round(cfg.refreshApiMs / 1000)
  $('refreshLocalSec').value = Math.round(cfg.refreshLocalMs / 1000)
}

function readValue(id) {
  const el = $(id)
  if (el.type === 'checkbox') return el.checked
  if (el.type === 'number') return Number(el.value)
  if (el.type === 'range') return Number(el.value)
  return el.value
}

// Gõ ô số/ô chữ thì chờ một nhịp cho đỡ giật; dropdown/checkbox áp ngay.
// ⚠️ MỖI TRƯỜNG một bộ hẹn giờ RIÊNG (Map theo khoá của patch) — trước đây dùng CHUNG 1 timer:
// sửa trường A (debounce 500ms) rồi sửa trường B trong lúc đang chờ sẽ `clearTimeout` mất bản vá
// của A, A không bao giờ được gửi đi (bẫy codex soi ra). Mỗi patch chỉ có đúng 1 khoá (xem các
// nơi gọi push() bên dưới) nên lấy khoá đó làm định danh timer là đủ, không cần gộp patch.
const timers = new Map()
function push(patch, delay = 0) {
  const key = Object.keys(patch)[0]
  clearTimeout(timers.get(key))
  timers.set(key, setTimeout(async () => {
    const res = await window.api.setConfig(patch)
    // Phím tắt sai cú pháp phải BÁO RÕ, không được im lặng nuốt lỗi.
    if (patch.hotkey !== undefined) {
      $('err').textContent = res.hotkeyOk === false ? '⚠️ Phím tắt này không dùng được — thử tổ hợp khác.' : ''
    }
  }, delay))
}

for (const id of FIELDS) {
  const el = $(id)
  const delay = el.tagName === 'SELECT' || el.type === 'checkbox' ? 0 : (el.type === 'range' ? 120 : 500)
  el.addEventListener('input', () => {
    if (id === 'opacity') showOpacity()   // số % chạy theo tay kéo, không đợi debounce
    push({ [id]: readValue(id) }, delay)
  })
}
$('refreshApiSec').addEventListener('input', () => push({ refreshApiMs: Math.max(180, Number($('refreshApiSec').value)) * 1000 }, 500))
$('refreshLocalSec').addEventListener('input', () => push({ refreshLocalMs: Math.max(2, Number($('refreshLocalSec').value)) * 1000 }, 500))

// ---- AI hiển thị -------------------------------------------------------------------------
// Tắt một AI là ngưng luôn cả bước dò của nó (không chỉ ẩn khỏi giao diện).
// AI không có trên máy vẫn hiện nhưng khoá lại, kèm chữ "chưa cài" — để người dùng biết app hỗ trợ
// AI đó chứ không phải quên, khỏi phải đi hỏi.
let disabled = []
let providerOrder = []   // id theo đúng thứ tự người dùng sắp — rỗng = giữ thứ tự phát hiện
let current = {}         // cấu hình đang áp — dùng để merge patch của preset trước khi fill() lại

// Sắp `list` theo `providerOrder` hiện có; id chưa từng sắp thì rơi xuống cuối theo thứ tự gốc.
function orderedProviders(list) {
  if (!providerOrder.length) return list
  const rank = new Map(providerOrder.map((id, i) => [id, i]))
  return [...list].sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : 999) - (rank.has(b.id) ? rank.get(b.id) : 999))
}

async function renderProviders() {
  const list = orderedProviders(await window.api.getProviders())
  const box = $('providers'); box.textContent = ''
  list.forEach((p, i) => {
    const lb = document.createElement('label')
    const sp = document.createElement('span')
    sp.textContent = p.name + (p.available ? '' : ' — chưa cài')
    const cb = document.createElement('input')
    cb.type = 'checkbox'; cb.checked = p.enabled; cb.disabled = !p.available
    cb.addEventListener('input', () => {
      disabled = cb.checked ? disabled.filter((x) => x !== p.id) : [...new Set([...disabled, p.id])]
      push({ disabledProviders: disabled })
    })
    const up = document.createElement('button')
    up.type = 'button'; up.textContent = '↑'; up.className = 'reorder-btn'; up.disabled = i === 0
    up.addEventListener('click', () => moveProvider(list, i, -1))
    const down = document.createElement('button')
    down.type = 'button'; down.textContent = '↓'; down.className = 'reorder-btn'; down.disabled = i === list.length - 1
    down.addEventListener('click', () => moveProvider(list, i, 1))
    lb.append(sp, cb, up, down); box.append(lb)
  })
  // Antigravity chỉ đọc được khi tiến trình `agy` ĐANG CHẠY (RPC nội bộ) — lần đầu chưa từng bật
  // thì nó hiện "chưa cài", không phải lỗi. Bật agy lên là có trong ~15 giây.
  $('providersHint').textContent = list.some((p) => !p.available)
    ? 'Antigravity cần chạy `agy`; Grok cần đăng nhập Grok CLI.'
    : ''
}

function moveProvider(list, i, dir) {
  const j = i + dir
  if (j < 0 || j >= list.length) return
  const ids = list.map((p) => p.id)
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  providerOrder = ids
  push({ providerOrder })
  renderProviders()
}

// mục 12: preset gộp nhiều khoá thành 1 patch — chọn xong tự về "— chọn preset —" (không phải
// một trạng thái cố định để giữ, chỉ là hành động "áp 1 lần").
$('preset').addEventListener('change', () => {
  const v = $('preset').value
  if (!v || !PRESETS[v]) return
  const patch = PRESETS[v]
  push(patch, 0)
  fill({ ...current, ...patch })
  $('preset').value = ''
})

// mục 12: xuất/nhập cấu hình — dùng hộp thoại file THẬT của macOS (không phải tải qua trình
// duyệt), an toàn với CSP `default-src 'none'` vì toàn bộ việc đọc/ghi file làm ở main process.
$('exportCfg').addEventListener('click', async () => {
  const res = await window.api.exportConfig()
  $('err').textContent = res.ok || res.ok === undefined ? '' : ('Lỗi xuất: ' + (res.error || 'không rõ'))
})
$('importCfg').addEventListener('click', async () => {
  const res = await window.api.importConfig()
  if (res.ok) {
    $('err').textContent = ''
    current = res.config
    disabled = res.config.disabledProviders || []
    providerOrder = res.config.providerOrder || []
    fill(res.config); renderProviders()
  } else if (res.error) { $('err').textContent = 'Lỗi nhập: ' + res.error }
})

$('reset').addEventListener('click', async () => {
  const cfg = await window.api.resetConfig()
  current = cfg
  disabled = cfg.disabledProviders || []
  providerOrder = cfg.providerOrder || []
  fill(cfg); renderProviders()
})
$('refresh').addEventListener('click', () => window.api.refreshNow())

window.api.getConfig().then((cfg) => {
  current = cfg
  disabled = cfg.disabledProviders || []
  providerOrder = cfg.providerOrder || []
  fill(cfg)
})
renderProviders()
