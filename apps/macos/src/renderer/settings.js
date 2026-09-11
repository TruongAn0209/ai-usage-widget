// Cài đặt ÁP DỤNG TRỰC TIẾP: đổi là widget đổi ngay và tự lưu — không có nút "Lưu".
// Nút còn lại chỉ là "Khôi phục mặc định" và "Làm mới ngay".
const $ = (id) => document.getElementById(id)
const FIELDS = ['layout', 'palette', 'compact', 'opacity', 'hoverBoost', 'width', 'showContext',
  'contextLimit', 'showForecast', 'topMetricOnly', 'alertsEnabled', 'alertWarnPct', 'alertCritPct',
  'alwaysOnTop', 'locked', 'launchAtLogin', 'showTrayTitle', 'followClaudeCli', 'hotkey', 'lang']

// ---- Song ngữ: điền mọi nhãn tĩnh từ dict main.js gửi qua get-strings ------------------------
let S = null
function applyStrings(s) {
  S = s
  document.title = s.settingsWindowTitle
  document.documentElement.lang = (localStorage.getItem('resolvedLang') || 'vi')
  $('modeCompact').textContent = s.modeCompact
  $('modeFull').textContent = s.modeFull
  document.getElementById('settingsMode').setAttribute('aria-label', s.settingsModeLabel)
  $('hDisplay').textContent = s.sectionDisplay
  $('lblLayout').textContent = s.fieldLayout
  const layoutOpts = { bars: s.optLayoutBars, rings: s.optLayoutRings, strip: s.optLayoutStrip, dashboard: s.optLayoutDashboard, terminal: s.optLayoutTerminal }
  for (const opt of $('layout').options) opt.textContent = layoutOpts[opt.value]
  $('lblPalette').textContent = s.fieldPalette
  const palOpts = { espresso: s.optPalEspresso, dark: s.optPalDark, light: s.optPalLight, default: s.optPalDefault, catppuccin: s.optPalCatppuccin, dracula: s.optPalDracula, nord: s.optPalNord, gruvbox: s.optPalGruvbox, oled: s.optPalOled, 'tokyo-night': s.optPalTokyoNight }
  for (const opt of $('palette').options) opt.textContent = palOpts[opt.value]
  $('lblCompact').textContent = s.fieldCompactWidget
  $('lblOpacity').textContent = s.fieldOpacity + ' '
  $('hintOpacity').textContent = s.hintOpacity
  $('lblHoverBoost').textContent = s.fieldHoverBoost
  $('lblWidth').textContent = s.fieldWidth
  $('lblShowContext').textContent = s.fieldShowContext
  $('lblContextLimit').textContent = s.fieldContextLimit
  $('optContextAuto').textContent = s.optContextAuto
  $('hintContextLimit').textContent = s.hintContextLimit
  $('lblShowForecast').textContent = s.fieldShowForecast
  $('hintShowForecast').textContent = s.hintShowForecast
  $('lblTopMetricOnly').textContent = s.fieldTopMetricOnly
  $('hintTopMetricOnly').textContent = s.hintTopMetricOnly
  $('lblPreset').textContent = s.fieldPreset
  $('optPresetNone').textContent = s.optPresetNone
  $('optPresetFull').textContent = s.optPresetFull
  $('optPresetCompact').textContent = s.optPresetCompact
  $('optPresetWork').textContent = s.optPresetWork

  $('hProviders').textContent = s.sectionProviders
  $('hintProvidersOrder').textContent = s.hintProvidersOrder

  $('hConfig').textContent = s.sectionConfig
  $('exportCfg').textContent = s.btnExportConfig
  $('importCfg').textContent = s.btnImportConfig
  $('hintConfigSafe').textContent = s.hintConfigSafe

  $('hAlerts').textContent = s.sectionAlerts
  $('lblAlertsEnabled').textContent = s.fieldAlertsEnabled
  $('lblAlertWarn').textContent = s.fieldAlertWarn
  $('lblAlertCrit').textContent = s.fieldAlertCrit

  $('hRefreshRate').textContent = s.sectionRefreshRate
  $('lblRefreshApi').textContent = s.fieldRefreshApi
  $('hintRefreshApiFloor').textContent = s.hintRefreshApiFloor
  $('lblRefreshLocal').textContent = s.fieldRefreshLocal

  $('hSystem').textContent = s.sectionSystem
  $('lblLanguage').textContent = s.fieldLanguage
  $('optLangAuto').textContent = s.optLangAuto
  $('optLangVi').textContent = s.optLangVi
  $('optLangEn').textContent = s.optLangEn
  $('lblAlwaysOnTop').textContent = s.fieldAlwaysOnTop
  $('lblLocked').textContent = s.fieldLocked
  $('lblFollowClaudeCli').textContent = s.fieldFollowClaudeCli
  $('hintFollowClaudeCli').textContent = s.hintFollowClaudeCli
  $('lblHotkey').textContent = s.fieldHotkey
  $('hotkey').placeholder = s.hotkeyPlaceholder
  $('lblLaunchAtLogin').textContent = s.fieldLaunchAtLogin
  $('lblShowTrayTitle').textContent = s.fieldShowTrayTitle
  $('refresh').textContent = s.btnRefreshSettings
  $('reset').textContent = s.btnReset
  showOpacity()
  renderProviders()
}

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
  $('lang').value = cfg.lang || 'auto'
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
  $('showTrayTitle').checked = !!cfg.showTrayTitle
  $('followClaudeCli').checked = !!cfg.followClaudeCli
  $('hotkey').value = cfg.hotkey || ''
  $('refreshApiSec').value = Math.round(cfg.refreshApiMs / 1000)
  $('refreshLocalSec').value = Math.round(cfg.refreshLocalMs / 1000)
  updatePreview()
}

function updatePreview() {
  const card = $('previewCard')
  if (!card) return
  const pal = $('palette').value || 'espresso'
  const lay = $('layout').value || 'bars'
  card.dataset.palette = pal
  card.dataset.layout = lay
  const body = $('previewBody')
  body.textContent = ''
  if (lay === 'terminal') {
    const term = document.createElement('div'); term.className = 'term-preview'
    const p = document.createElement('div'); p.className = 'term-prompt'; p.textContent = '$ ai --usage'
    const l1 = document.createElement('div'); l1.className = 'term-line'
    l1.innerHTML = '<span class="term-key">GPT Plus</span><span class="term-bar">[░░░░░░░░░░]</span><span class="term-pct">0%</span>'
    const l2 = document.createElement('div'); l2.className = 'term-line'
    l2.innerHTML = '<span class="term-key">Antigravity</span><span class="term-bar warn">[██░░░░░░░░]</span><span class="term-pct warn">18%</span>'
    const note = document.createElement('div'); note.className = 'term-note'; note.textContent = '  └─ agy Pro'
    term.append(p, l1, l2, note)
    body.append(term)
  } else if (lay === 'rings') {
    const rings = document.createElement('div'); rings.className = 'rings-preview'
    const r1 = document.createElement('div'); r1.className = 'ring-preview-item'
    r1.innerHTML = '<div class="mini-circle">0%</div><span>5 giờ</span>'
    const r2 = document.createElement('div'); r2.className = 'ring-preview-item'
    r2.innerHTML = '<div class="mini-circle warn">18%</div><span>Tuần</span>'
    rings.append(r1, r2)
    body.append(rings)
  } else if (lay === 'strip') {
    const strip = document.createElement('div'); strip.className = 'strip-preview'
    const it1 = document.createElement('div'); it1.className = 'strip-item'
    it1.innerHTML = '<span class="strip-tag">5H</span><div class="strip-track"><div class="strip-fill"></div></div><span class="strip-pct">0%</span>'
    const it2 = document.createElement('div'); it2.className = 'strip-item'
    it2.innerHTML = '<span class="strip-tag">Tuần</span><div class="strip-track"><div class="strip-fill warn"></div></div><span class="strip-pct warn">18%</span>'
    it1.querySelector('.strip-fill').style.width = '4%'
    it2.querySelector('.strip-fill').style.width = '18%'
    strip.append(it1, it2)
    body.append(strip)
  } else {
    const bars = document.createElement('div'); bars.className = 'bars-preview'
    const row1 = document.createElement('div'); row1.className = 'row'
    row1.innerHTML = '<div class="head"><span class="label">5 giờ</span><span class="pct">0%</span></div><div class="bar"><i class="ok"></i></div>'
    const row2 = document.createElement('div'); row2.className = 'row'
    row2.innerHTML = '<div class="head"><span class="label">Tuần</span><span class="pct warn">18%</span></div><div class="bar"><i class="warn"></i></div><div class="note">còn 5 ngày</div>'
    row1.querySelector('.bar > i').style.width = '4%'
    row2.querySelector('.bar > i').style.width = '18%'
    bars.append(row1, row2)
    body.append(bars)
  }
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
      $('err').textContent = res.hotkeyOk === false ? S.hotkeyBad : ''
    }
    // Đổi ngôn ngữ: main.js đã tính lại dict, áp ngay không đợi mở lại cửa sổ Cài đặt.
    if (patch.lang !== undefined && res.strings) applyStrings(res.strings)
  }, delay))
}

for (const id of FIELDS) {
  const el = $(id)
  const delay = el.tagName === 'SELECT' || el.type === 'checkbox' ? 0 : (el.type === 'range' ? 120 : 500)
  el.addEventListener('input', () => {
    if (id === 'opacity') showOpacity()   // số % chạy theo tay kéo, không đợi debounce
    if (id === 'layout' || id === 'palette') updatePreview()
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
    sp.textContent = p.name + (p.available ? '' : (S ? S.providerNotInstalled : ''))
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
  $('providersHint').textContent = list.some((p) => !p.available) && S ? S.providersHint : ''
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
const tpl = (str, vars) => String(str).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
$('exportCfg').addEventListener('click', async () => {
  const res = await window.api.exportConfig()
  $('err').textContent = res.ok || res.ok === undefined ? '' : tpl(S.errExportFail, { msg: res.error || '?' })
})
$('importCfg').addEventListener('click', async () => {
  const res = await window.api.importConfig()
  if (res.ok) {
    $('err').textContent = ''
    current = res.config
    disabled = res.config.disabledProviders || []
    providerOrder = res.config.providerOrder || []
    fill(res.config); renderProviders()
  } else if (res.error) { $('err').textContent = tpl(S.errImportFail, { msg: res.error }) }
})

$('reset').addEventListener('click', async () => {
  const cfg = await window.api.resetConfig()
  current = cfg
  disabled = cfg.disabledProviders || []
  providerOrder = cfg.providerOrder || []
  fill(cfg); renderProviders()
})
$('refresh').addEventListener('click', () => window.api.refreshNow())

window.api.getStrings().then(applyStrings)
window.api.getConfig().then((cfg) => {
  current = cfg
  disabled = cfg.disabledProviders || []
  providerOrder = cfg.providerOrder || []
  fill(cfg)
})
