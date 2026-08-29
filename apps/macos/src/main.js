// Tiến trình chính — cửa sổ nổi, khay hệ thống, 2 nhịp làm mới, cài đặt áp dụng trực tiếp.
// Ứng dụng macOS: cửa sổ nổi, khay hệ thống, cài đặt và các nhịp làm mới.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, Notification, globalShortcut, nativeImage, shell, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

const providers = require('./providers')
const forecast = require('./forecast')
const tracker = require('./usageTracker')
const { sanitizeConfig } = require('./configSchema')
const i18n = require('./i18n')
const providerState = require('./providerState')
const { trySwapHotkey: swapHotkey } = require('./hotkey')
const { providerResults, aggregateRefreshResults } = require('./refreshResult')
const { getClaudeWorkState, getTerminalState, setTerminalWindowState } = require('./claudeCliWatcher')
const { createTerminalWidgetSync } = require('./terminalWidgetSync')

// ---- Cấu hình -----------------------------------------------------------------
// Để trong Application Support, KHÔNG ghi vào thư mục app (bản .app đóng gói chỉ đọc).
const CONFIG_DIR = path.join(app.getPath('appData'), 'ai-usage-widget-mac')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const DEFAULTS = {
  lang: 'auto',          // 'auto' | 'vi' | 'en' — auto suy theo app.getLocale()
  corner: 'top-right',
  customPosition: null,
  palette: 'espresso',
  // 5 bố cục (bars mặc định) · 8 bảng màu — 2 trục ĐỘC LẬP, đổi cái này không đụng cái kia.
  layout: 'bars',
  compact: false,
  opacity: 0.95,        // 0.15–1 · càng nhỏ càng trong suốt
  hoverBoost: true,     // rê chuột vào thì hiện rõ 100% cho dễ đọc
  width: 260,
  showForecast: true,   // "hết ~14:20" — chỉ hiện khi đo được tốc độ thật
  disabledProviders: [],// id các AI bị tắt trong Cài đặt (rỗng = hiện hết)
  launchAtLogin: false, // tự mở khi đăng nhập macOS (mục 11)
  alwaysOnTop: true,    // widget nổi trên mọi cửa sổ khác — có thể tắt nếu thấy vướng
  followClaudeCli: false, // tương thích tên khoá cũ: chỉ hiện khi Claude CLI hoặc Claude IDE đang được thao tác
  locked: false,        // "khoá vị trí": không cho kéo widget nữa; các nút vẫn phải bấm được
  providerOrder: [],    // thứ tự AI do người dùng sắp — rỗng = giữ thứ tự phát hiện
  topMetricOnly: false, // chỉ hiện mục CAO NHẤT của mỗi AI — gọn khi có nhiều hạn mức con (mục 12)
  refreshApiMs: 180000,   // ★ sàn 180s — dưới mức này Anthropic trả 429 dồn dập
  refreshLocalMs: 8000,
  // AI đọc bằng RPC cục bộ (Antigravity) KHÔNG dính sàn 180s — sàn đó chỉ để tránh 429 của
  // Anthropic. Bắt nó ăn theo thì bật `agy` lên phải đợi tới 3 phút mới thấy.
  refreshLocalProvidersMs: 15000,
  alertsEnabled: true,
  alertWarnPct: 80,
  alertCritPct: 95,
  hotkey: 'Control+Alt+U',
  showContext: true,
  // Trần ngữ cảnh: 'auto' = tự suy (xem contextLimitFor), hoặc số token đặt tay ('200000'/'1000000').
  // Đặt tay là cách DUY NHẤT đúng 100% — không file nào trên máy ghi cửa sổ thật của phiên.
  contextLimit: 'auto',
}
let config = { ...DEFAULTS }
// Dict hiện hành theo config.lang + locale hệ thống — gọi lại mỗi lần cần (đổi ngôn ngữ trong Cài
// đặt phải có hiệu lực ngay, không cache dict cũ).
function s() { return i18n.getStrings(config.lang, app.getLocale()) }

// ★ Đi qua `sanitizeConfig` dù là đọc từ đĩa — file config.json có thể bị tay ai đó sửa lỗi tay,
//   hoặc còn sót khoá/kiểu của bản cũ hơn (codex soi ra 02/08: `disabledProviders: null`,
//   `width: "abc"` từng lọt thẳng vào `config` rồi phá hình học cửa sổ lúc `setBounds()`).
function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    config = { ...DEFAULTS, ...sanitizeConfig(raw, DEFAULTS) }
  } catch { config = { ...DEFAULTS } }
}
// Ghi NGUYÊN TỬ qua file tạm + rename — rename cùng thư mục trên cùng volume là 1 lệnh hệ thống
// KHÔNG chia đôi (POSIX), nên tiến trình bị kill/crash giữa lúc ghi (mất điện, force-quit) không
// bao giờ để lại config.json nửa-ghi-dở mà loadConfig() đọc ra JSON hỏng ở lần mở app kế tiếp.
function saveConfig() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
    const tmp = CONFIG_FILE + '.tmp-' + process.pid
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2))
    fs.renameSync(tmp, CONFIG_FILE)
  } catch { /* không chặn app vì lỗi ghi config */ }
}

// ---- Cửa sổ -------------------------------------------------------------------
let win = null, tray = null, settingsWin = null
let lastContentHeight = 120
let programmaticMove = false
// ★ Widget sống ở khay — không có nút đóng riêng, nhưng macOS vẫn phát `Cmd+W` (menu App mặc định
// của Electron khi không tự đặt Menu) tới cửa sổ đang focus. Không chặn thì `win.close()` huỷ hẳn
// đối tượng `win` (không phải ẩn) — biến `win` vẫn còn tham chiếu tới đối tượng ĐÃ HUỶ, mọi lần
// gọi `win.isVisible()`/`win.show()` sau đó (menu khay, phím tắt) ném lỗi "object destroyed" →
// không mở lại được nữa (đúng bẫy codex soi ra). Chặn sự kiện `close` để chỉ ẩn, trừ lúc thật sự
// thoát app (cờ `isQuitting`, bật ở `before-quit`) thì mới cho đóng thật.
let isQuitting = false
// Chỉ watcher được phép hoàn tác lần ẩn do chính nó gây ra. Ẩn bằng hotkey/khay/Cmd+W sẽ xoá
// cờ này, nên lần kiểm tra kế tiếp không tự hiện widget đè lên lựa chọn thủ công.
let autoHiddenByWatcher = false
let watcherSeq = 0
// Guard này là nguồn sự thật cho chiều widget → Terminal: lượt poll kế tiếp không echo lại
// hành động vừa do người dùng yêu cầu. Chỉ Terminal.app đang chạy mới được điều khiển; không relaunch.
const terminalWidgetSync = createTerminalWidgetSync({
  getTerminalState,
  setTerminalWindowState,
  log: (message) => console.error(`[đồng bộ Terminal] ${message}`),
})

function currentPosition(w, h) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const wa = display.workArea
  if (config.customPosition) return clampToVisibleArea(config.customPosition.x, config.customPosition.y, w, h)
  const pad = 20
  const x = config.corner.includes('right') ? wa.x + wa.width - w - pad : wa.x + pad
  const y = config.corner.includes('bottom') ? wa.y + wa.height - h - pad : wa.y + pad
  return { x, y }
}

// Ép TOÀN BỘ khung nằm gọn trong vùng làm việc của màn hình chứa nó. Bản Windows từng để widget
// "bị cắt" ở đáy vì chỉ kiểm chồng lấn 20px — ở đây kiểm cả 4 cạnh.
function clampToVisibleArea(x, y, w, h) {
  const display = screen.getDisplayNearestPoint({ x, y })
  const wa = display.workArea
  return {
    x: Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - w)),
    y: Math.round(Math.min(Math.max(y, wa.y), wa.y + wa.height - h)),
  }
}

// Mỗi bố cục cần bề ngang khác nhau: bảng lớn có 2 cột, dải siêu gọn nằm ngang.
// Cộng thêm vào bề ngang đã đặt để không phải chỉnh lại mỗi lần đổi bố cục.
const LAYOUT_WIDTH_BONUS = { dashboard: 190, strip: 110 }

function windowWidth() {
  return config.width + (LAYOUT_WIDTH_BONUS[config.layout] || 0)
}

function applyWindowGeometry() {
  if (!win) return
  const w = windowWidth()
  const h = Math.max(80, Math.round(lastContentHeight))
  const { x, y } = currentPosition(w, h)
  programmaticMove = true
  win.setBounds({ x, y, width: w, height: h })
  setTimeout(() => { programmaticMove = false }, 60)
}

function createWindow() {
  win = new BrowserWindow({
    width: windowWidth(), height: 140,
    show: !config.followClaudeCli,
    frame: false, transparent: true, resizable: false,
    alwaysOnTop: config.alwaysOnTop !== false, skipTaskbar: true, hasShadow: false,
    fullscreenable: false, movable: !config.locked,
    webPreferences: {
      preload: path.join(__dirname, 'preload-widget.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  })
  autoHiddenByWatcher = !!config.followClaudeCli
  win.setAlwaysOnTop(config.alwaysOnTop !== false, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  win.on('moved', () => {
    if (programmaticMove || !win) return
    const [x, y] = win.getPosition()
    config.customPosition = { x, y }   // kéo tay → nhớ đúng chỗ, không tự nhảy về góc
    saveConfig()
  })
  win.on('close', (e) => {
    if (isQuitting) return
    e.preventDefault()
    autoHiddenByWatcher = false
    win.hide()
  })
  win.once('ready-to-show', () => { applyWindowGeometry(); pushAll() })
}

// ---- Cảnh báo sắp chạm hạn mức -------------------------------------------------
// Chống spam: mỗi cửa sổ hạn mức chỉ báo 1 lần cho mỗi mức; báo lại khi resetAt đổi (cửa sổ mới)
// hoặc khi đã tụt xuống dưới ngưỡng-10 rồi leo lên lại.
// Khoá trạng thái là ĐỊNH DANH `providerId|metricKey`, KHÔNG phải nhãn hiển thị — hai AI cùng có
// mục tên "Tuần" mà dùng chung khoá là đè trạng thái của nhau (codex soi ra ở bản Windows).
const alertState = new Map()
function checkAlerts(list) {
  if (!config.alertsEnabled || !Notification.isSupported()) return
  const multi = list.filter((p) => p.ok).length > 1
  for (const p of list) {
    if (!p.ok) continue
    for (const m of p.metrics || []) {
      if (m.pct == null) continue
      if (m.stale) continue   // số cũ (mất mạng / agy tắt) không được dùng để bắn cảnh báo mới
      const key = p.id + '|' + m.key
      const st = alertState.get(key) || { level: 0, resetAt: m.resetAt }
      if (st.resetAt !== m.resetAt) { st.level = 0; st.resetAt = m.resetAt }
      let level = 0
      if (m.pct >= config.alertCritPct) level = 2
      else if (m.pct >= config.alertWarnPct) level = 1
      if (level > st.level) {
        const strings = s()
        new Notification({
          title: i18n.fmt(level === 2 ? strings.alertCritTitle : strings.alertWarnTitle, { name: p.name }),
          body: `${multi ? p.name + ' · ' : ''}${m.label}: ${strings.usedPrefix} ${m.pct.toFixed(0)}%`,
          silent: level === 1,
        }).show()
        st.level = level
      } else if (level === 0 && m.pct < config.alertWarnPct - 10) {
        st.level = 0
      }
      alertState.set(key, st)
    }
  }
}

// ---- Nhịp làm mới --------------------------------------------------------------
let apiTimer = null, localTimer = null, localProvidersTimer = null, claudeCliWatcherTimer = null
const CLAUDE_CLI_WATCHER_MS = 8000
let lastProviders = [{ id: 'claude', name: 'Claude', ok: false, error: 'LOADING', metrics: [] }]
let lastLocal = { available: false }
let lastToday = { sessionsToday: 0, totalSessions: 0, tokens: 0, messages: 0, models: [], sessions: [] }
let lastForecasts = {}

// ---- Trạng thái từng AI: số TỐT gần nhất + mốc lấy được -------------------------
// `providerGood` giữ NGUYÊN VẸN kết quả `ok:true` gần nhất của mỗi AI (không đụng vào), để mỗi lần
// mạng lỗi có thể "bọc lại" từ đúng bản gốc thay vì bọc chồng lên bản đã bọc lỗi lần trước (không
// thì chú thích "mất mạng · số lúc …" dồn lại thành 1 câu dài vô nghĩa qua vài lượt lỗi liên tiếp).
// `providerById` là bản ĐANG HIỂN THỊ — khoá theo id để 2 luồng (API 180s + cục bộ 5-15s) merge
// đúng từng AI, không đụng tới AI của luồng kia (bài học cũ: `refreshApi` từng thay CẢ MẢNG, xoá
// mất kết quả Antigravity vừa lấy được ở nhịp nhanh).
const { providerGood, providerById, buildEntry, wrapStale } = providerState
const remoteProviderIds = providers.ALL.filter((provider) => !provider.local).map((provider) => provider.id)
const localProviderIds = providers.ALL.filter((provider) => provider.local).map((provider) => provider.id)

function reconcileProviders(list, sourceIds) {
  lastProviders = providerState.reconcileProviders(list, sourceIds)
}

function upsertProviders(list) {
  lastProviders = providerState.upsertProviders(list)
}

// ★ 2 lần refreshApi có thể chạy CHỒNG NHAU (timer 180s + "Làm mới ngay" + đổi cài đặt AI hiển
// thị đều gọi refreshApi() không chờ nhau) — mạng chậm/nhanh khác nhau nên phản hồi có thể về
// KHÔNG đúng thứ tự đã gọi. Không có chốt thì lần gọi CŨ về sau lại đè số MỚI vừa nhận. Chốt bằng
// số thứ tự: chỉ lần gọi nào bắt đầu SAU CÙNG mới được phép ghi vào lastProviders.
let apiSeq = 0
async function refreshApi() {
  const seq = ++apiSeq
  // `fetchAll` CHỈ hỏi AI từ xa (xem providers/index.js) — AI cục bộ (Antigravity) có nhịp riêng
  // bên dưới, không đi qua đây, nên vòng 180 giây này không còn cách nào đụng tới/đè số của nó.
  const result = await providers.fetchAll(config.disabledProviders, s())
  if (seq !== apiSeq) return { source: 'remote', providers: providerResults(result), skipped: true }
  reconcileProviders(result, remoteProviderIds)
  // Nhật ký chẩn đoán — CHỈ trạng thái và số mục, TUYỆT ĐỐI không in token/credential.
  // Có mốc giờ để còn biết nhịp có chạy đúng chu kỳ không (log không giờ là log vô dụng).
  console.log(`[${new Date().toLocaleTimeString('vi-VN')}] api:`,
    result.map((p) => p.ok ? `${p.name} ok · ${p.metrics.length} mục` : `${p.name} lỗi ${p.error}`).join(' | '))
  // ★ Chỉ nạp mẫu dự báo Ở ĐÂY (nhịp API), không nạp ở nhịp cục bộ 8 giây — nhồi cùng một số
  //   đo nhiều lần sẽ làm lệch hồi quy (xem đầu file forecast.js).
  lastForecasts = forecast.update(lastProviders)
  checkAlerts(lastProviders)
  pushAll()
  return { source: 'remote', providers: providerResults(result) }
}
// Nhịp nhanh cho AI cục bộ (Antigravity) — merge THEO ID vào `providerById`, không đụng AI của
// nhịp API. Cùng bệnh chồng lượt như refreshApi (timer 5-15s + "Làm mới ngay" + đổi "AI hiển thị"
// đều gọi không chờ nhau) — chốt bằng số thứ tự riêng, không dùng chung apiSeq vì đây là 2 luồng
// độc lập.
let localProvidersSeq = 0
async function refreshLocalProviders() {
  const seq = ++localProvidersSeq
  const list = await providers.fetchLocal(config.disabledProviders, s())
  if (seq !== localProvidersSeq) return { source: 'local-provider', providers: providerResults(list), skipped: true }
  reconcileProviders(list, localProviderIds)
  checkAlerts(list)
  pushAll()
  console.log(`[${new Date().toLocaleTimeString('vi-VN')}] cục bộ:`,
    list.map((p) => p.ok ? `${p.name} ok · ${p.metrics.length} mục${p.metrics[0] && p.metrics[0].stale ? ' (số cũ)' : ''}` : `${p.name} ${p.error}`).join(' | ') || 'không phát hiện provider')
  return { source: 'local-provider', providers: providerResults(list) }
}

async function refreshFollowClaudeCli() {
  const seq = ++watcherSeq
  if (!config.followClaudeCli) {
    if (autoHiddenByWatcher && win && !win.isDestroyed()) {
      autoHiddenByWatcher = false
      win.showInactive()
      applyWindowGeometry()
      buildTray()
    }
    return
  }

  const status = await getClaudeWorkState()
  if (seq !== watcherSeq || !config.followClaudeCli || !win || win.isDestroyed()) return
  if (terminalWidgetSync.consumeTerminalPoll(status.cli.terminal).ignored) return
  // Đồng bộ hai chiều vẫn là tính năng riêng của CLI/Terminal. Terminal đã quit không được phép
  // chặn widget hiện theo Claude IDE, và cũng tuyệt đối không được làm Terminal khởi chạy lại.
  if (status.desktop.state === 'closed' && status.cli.terminal.state === 'closed') return
  const shouldShow = status.active
  if (!shouldShow && win.isVisible()) {
    win.hide()
    autoHiddenByWatcher = true
    buildTray()
  } else if (shouldShow && autoHiddenByWatcher) {
    autoHiddenByWatcher = false
    win.showInactive()
    applyWindowGeometry()
    buildTray()
  }
}

function restartFollowClaudeCliWatcher() {
  clearInterval(claudeCliWatcherTimer)
  claudeCliWatcherTimer = null
  // Tăng số thứ tự để kết quả AppleScript đang chạy từ cấu hình cũ không được áp muộn.
  watcherSeq++
  if (config.followClaudeCli) {
    claudeCliWatcherTimer = setInterval(refreshFollowClaudeCli, CLAUDE_CLI_WATCHER_MS)
  }
  // Áp dụng trực tiếp cả khi vừa bật lẫn vừa tắt; không đợi lượt 8 giây đầu tiên.
  refreshFollowClaudeCli()
}

async function refreshNowResult() {
  const settled = await Promise.allSettled([refreshApi(), refreshLocal(), refreshLocalProviders()])
  const results = settled.map((item, index) => {
    if (item.status === 'fulfilled') return item.value
    const source = index === 0 ? 'remote' : index === 1 ? 'local-usage' : 'local-provider'
    return { source, providers: [{ id: source, name: source, ok: false, error: item.reason?.message || 'UNKNOWN' }] }
  })
  return aggregateRefreshResults(results)
}

// readContext/todayStats nay bất đồng bộ (xem usageTracker.js) — chỉ đọc đĩa KHÔNG chặn luồng
// chính, nên refreshLocal/pushAll cũng phải async. Mọi nơi gọi 2 hàm này (menu khay, IPC, timer)
// vốn đã gọi kiểu "bắn rồi quên" (không await refreshApi), nên đổi sang async không đổi gì ở nơi gọi.
//
// ★ MỘT LƯỢT TẠI MỘT THỜI ĐIỂM: `refreshLocal` được gọi từ timer 8 giây, nút "Làm mới ngay", đổi
// trần ngữ cảnh và reset-config — không có gì ngăn các nguồn này gọi CHỒNG NHAU, mà mỗi lượt lại
// quét đĩa 2 lần (readContext + todayStats). Không khoá thì đĩa bị quét trùng vô ích, và lượt CŨ
// có thể trả về SAU lượt MỚI rồi ghi đè ngược (codex soi ra 02/08). `inFlight` gộp mọi lệnh gọi
// đến trong lúc đang quét thành DÙNG CHUNG một lượt thay vì tự mở lượt mới; `seq` chặn lượt cũ ghi
// đè kết quả của lượt mới hơn đã bắt đầu trong lúc chờ.
let localSeq = 0
let localInFlight = null
function refreshLocal() {
  if (localInFlight) return localInFlight
  const seq = ++localSeq
  localInFlight = (async () => {
    const [context, today] = await Promise.all([
      tracker.readContext(config.contextLimit),
      tracker.todayStats(config.contextLimit),
    ])
    if (seq !== localSeq) return   // có lượt mới hơn đã bắt đầu trong lúc chờ — bỏ kết quả cũ này
    lastLocal = context
    lastToday = today
    await pushAll()
  })()
  return localInFlight.finally(() => { localInFlight = null })
}
// KHÔNG tự đọc đĩa ở đây nữa — chỉ gửi những gì `refreshLocal`/`refreshApi`/`refreshLocalProviders`
// đã đo được gần nhất. Bản cũ gọi `tracker.todayStats()` ngay trong `pushAll()`, nên MỌI lần đẩy dữ
// liệu (kể cả nhịp API 180 giây, nhịp Antigravity 5-15 giây) đều kéo theo một lượt quét transcript
// riêng — vừa phí vừa là chỗ dễ chồng lượt nhất (đúng chỗ codex soi ra 02/08).
// Tooltip khay hệ thống — tóm tắt "Claude 42% · Codex 18%" kèm dấu ⚠ khi lỗi/mất mạng (mục 10:
// tên/trạng thái phải trung tính theo nhiều AI, không chỉ có brand Claude).
function trayTooltip() {
  if (!lastProviders.length) return 'AI Usage'
  const parts = lastProviders.map((p) => {
    if (!p.ok) return `${p.name} ⚠`
    let top = null
    for (const m of p.metrics || []) if (m.pct != null && (!top || m.pct > top.pct)) top = m
    return `${p.name} ${top ? Math.round(top.pct) + '%' : '—'}${p.stale ? ' ⚠' : ''}`
  })
  return parts.join(' · ') || 'AI Usage'
}
async function pushAll() {
  if (tray) tray.setToolTip(trayTooltip())
  if (win && !win.isDestroyed()) {
    win.webContents.send('usage-data', {
      providers: lastProviders,
      context: lastLocal,
      today: lastToday,
      forecasts: lastForecasts,
      strings: s(),
      lang: i18n.resolveLang(config.lang, app.getLocale()),
      config: {
        palette: config.palette, layout: config.layout, compact: config.compact,
        opacity: config.opacity, hoverBoost: config.hoverBoost,
        showContext: config.showContext, showForecast: config.showForecast,
        providerOrder: config.providerOrder, topMetricOnly: config.topMetricOnly,
      },
    })
  }
}
function startTimers() {
  clearInterval(apiTimer); clearInterval(localTimer); clearInterval(localProvidersTimer)
  apiTimer = setInterval(refreshApi, Math.max(180000, config.refreshApiMs))
  localTimer = setInterval(refreshLocal, Math.max(2000, config.refreshLocalMs))
  localProvidersTimer = setInterval(refreshLocalProviders, Math.max(5000, config.refreshLocalProvidersMs))
  restartFollowClaudeCliWatcher()
  // Gọi đủ cả ba nguồn ngay khi mở app. Nếu bỏ nguồn cục bộ, Antigravity phải chờ tới lượt timer
  // đầu tiên mới xuất hiện dù đang chạy sẵn.
  refreshApi(); refreshLocal(); refreshLocalProviders()
}

// ---- Khay hệ thống -------------------------------------------------------------
function trayIcon() {
  // Icon dạng template 16x16 vẽ tay (macOS tự đảo màu theo nền sáng/tối).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="black" stroke-width="2"/><path d="M8 4 v4 l3 2" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"/></svg>`
  const img = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))
  img.setTemplateImage(true)
  return img
}

function buildTray() {
  const strings = s()
  const OPACITY_PRESETS = [
    [strings.opacity25, 0.25], [strings.opacity40, 0.4], [strings.opacity60, 0.6],
    [strings.opacity80, 0.8], [strings.opacity100, 1],
  ]
  const LAYOUTS = [
    [strings.layoutBars, 'bars'], [strings.layoutRings, 'rings'], [strings.layoutStrip, 'strip'],
    [strings.layoutDashboard, 'dashboard'], [strings.layoutTerminal, 'terminal'],
  ]
  // Chỉ tạo Tray MỘT LẦN. Trước đây hàm này gọi `new Tray(...)` mỗi lần dựng lại menu → bấm
  // ẩn/hiện vài lần là mọc thêm mấy icon rác trên thanh trạng thái.
  if (!tray) { tray = new Tray(trayIcon()); tray.setToolTip(strings.appTitle) }
  const corners = [
    [strings.cornerTopLeft, 'top-left'], [strings.cornerTopRight, 'top-right'],
    [strings.cornerBottomLeft, 'bottom-left'], [strings.cornerBottomRight, 'bottom-right'],
  ]
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win && win.isVisible() ? strings.trayHide : strings.trayShow, click: toggleWindow },
    { type: 'separator' },
    {
      label: strings.trayPosition, submenu: corners.map(([label, key]) => ({
        label, type: 'radio', checked: config.corner === key && !config.customPosition,
        click: () => { config.corner = key; config.customPosition = null; saveConfig(); applyWindowGeometry() },
      })),
    },
    {
      label: strings.trayLayout, submenu: LAYOUTS.map(([label, key]) => ({
        label, type: 'radio', checked: (config.layout || 'bars') === key,
        // Đổi bố cục là đổi cả bề ngang cần dùng → phải reset chiều cao đo được, không thì
        // cửa sổ giữ chiều cao của bố cục cũ cho tới lần đo kế tiếp (nhìn như bị cắt).
        click: () => { config.layout = key; lastContentHeight = 120; saveConfig(); applyWindowGeometry(); pushAll(); buildTray() },
      })),
    },
    {
      label: strings.trayOpacity, submenu: OPACITY_PRESETS.map(([label, v]) => ({
        label, type: 'radio', checked: Math.abs((config.opacity ?? 0.95) - v) < 0.03,
        click: () => { config.opacity = v; saveConfig(); pushAll(); buildTray() },
      })),
    },
    {
      label: strings.trayHoverBoost, type: 'checkbox', checked: config.hoverBoost !== false,
      click: () => { config.hoverBoost = config.hoverBoost === false; saveConfig(); pushAll(); buildTray() },
    },
    { type: 'separator' },
    {
      label: strings.trayAlwaysOnTop, type: 'checkbox', checked: config.alwaysOnTop !== false,
      click: () => { config.alwaysOnTop = config.alwaysOnTop === false; saveConfig(); applyAlwaysOnTop(); buildTray() },
    },
    {
      label: config.locked ? strings.trayUnlock : strings.trayLock,
      click: toggleLocked,
    },
    {
      label: strings.trayAutostart, type: 'checkbox', checked: !!config.launchAtLogin,
      click: () => { config.launchAtLogin = !config.launchAtLogin; saveConfig(); applyLoginItem(); buildTray() },
    },
    { type: 'separator' },
    { label: strings.trayRefreshNow, click: () => { void refreshNowResult() } },
    { label: strings.traySettings, click: openSettings },
    { type: 'separator' },
    { label: strings.trayOpenConfigFolder, click: () => shell.openPath(CONFIG_DIR) },
    { label: strings.trayQuit, click: () => app.quit() },
  ]))
}

// ---- 3 công tắc tiện dụng (mục 11) ---------------------------------------------
// (1) Khởi động cùng máy — chỉ có tác dụng thật trên bản .app đóng gói/đã cài vào /Applications;
//     chạy `npm start` từ mã nguồn thì macOS không có "đường dẫn app" ổn định để đăng ký, Electron
//     tự bỏ qua yêu cầu — bọc try/catch để không làm hỏng gì trong lúc phát triển.
function applyLoginItem() {
  try { app.setLoginItemSettings({ openAtLogin: !!config.launchAtLogin }) } catch { /* bỏ qua lúc dev */ }
}
// (2) Luôn nổi trên cùng — bật/tắt được khi xem phim/họp toàn màn hình.
function applyAlwaysOnTop() {
  if (!win) return
  win.setAlwaysOnTop(config.alwaysOnTop !== false, 'floating')
}
// (3) Khoá vị trí — chỉ cấm kéo widget. Không dùng setIgnoreMouseEvents ở đây vì nó làm
// nút ⚙ và ⟳ mất hoàn toàn sự kiện chuột, khiến người dùng không thể vào Cài đặt bằng click.
function applyLocked() {
  if (!win) return
  win.setMovable(!config.locked)
}
function toggleLocked() {
  config.locked = !config.locked
  saveConfig()
  applyLocked()
  buildTray()
}

function toggleWindow() {
  if (!win) return
  const wasVisible = win.isVisible()
  autoHiddenByWatcher = false
  if (wasVisible) win.hide(); else { win.show(); applyWindowGeometry() }
  buildTray()
  if (config.followClaudeCli) {
    void terminalWidgetSync.toggleWidget(wasVisible).catch((error) => {
      console.error('[đồng bộ Terminal] lỗi không mong muốn:', error?.message || error)
    })
  }
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return }
  settingsWin = new BrowserWindow({
    width: 400, height: 700, title: s().settingsWindowTitle, resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  })
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'))
}

// ---- Xác minh nguồn gọi IPC (mục 15) ---------------------------------------------
// App chỉ `loadFile()` đúng 2 trang HTML tĩnh trong chính gói app, không bao giờ tải nội dung từ
// xa — nên về lý thuyết không có cách nào renderer chạy nội dung lạ. Vẫn kiểm `senderFrame.url`
// làm hàng rào THỨ HAI: lỡ sau này có chỗ nào (webview, target=_blank…) load được nội dung ngoài
// trong cùng tiến trình, trang đó vẫn không gọi được IPC ghi cấu hình chỉ vì đứng cùng process.
function senderPath(event) {
  const url = event.senderFrame ? event.senderFrame.url : ''
  try { return decodeURIComponent(new URL(url).pathname) } catch { return '' }
}
const isWidgetSender = (event) => senderPath(event).endsWith('/renderer/index.html')
const isSettingsSender = (event) => senderPath(event).endsWith('/renderer/settings.html')

// ---- IPC ------------------------------------------------------------------------
ipcMain.on('content-height', (e, h) => {
  if (!isWidgetSender(e)) return
  const n = Number(h)
  if (!Number.isFinite(n)) return   // renderer lỗi vẽ có thể gửi NaN/undefined — bỏ qua, đừng phá cửa sổ
  // Kẹp theo chiều cao vùng làm việc của màn hình — renderer bị lỗi CSS/layout dựng ra chiều cao
  // khổng lồ thì cửa sổ tối đa chỉ to bằng màn hình, không tràn ra ngoài tầm với.
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const next = Math.max(80, Math.min(display.workArea.height, Math.round(n)))
  if (Math.abs(next - lastContentHeight) < 2) return
  lastContentHeight = next
  applyWindowGeometry()
})
ipcMain.on('open-settings', (e) => { if (isWidgetSender(e)) openSettings() })   // nút ⚙ trên widget
ipcMain.handle('get-config', (e) => (isSettingsSender(e) ? config : null))
ipcMain.handle('get-strings', (e) => (isSettingsSender(e) ? s() : null))
ipcMain.handle('get-providers', (e) => (isSettingsSender(e) ? providers.catalog(config.disabledProviders) : []))
ipcMain.handle('set-config', (e, rawPatch) => {
  if (!isSettingsSender(e)) return { ...config }
  const before = config
  // Toàn bộ patch từ trang Cài đặt đi qua sanitizeConfig trước — khoá lạ bị bỏ, kiểu sai bị ép/kẹp
  // về giá trị cũ (xem configSchema.js). Chỉ những khoá ĐÃ QUA sanitize mới được coi là "có đổi".
  const patch = sanitizeConfig(rawPatch, before)
  let hotkeyOk
  if ('hotkey' in patch && patch.hotkey !== before.hotkey) {
    hotkeyOk = trySwapHotkey(patch.hotkey, before.hotkey)
    if (!hotkeyOk) patch.hotkey = before.hotkey   // đăng ký thất bại → giữ nguyên phím cũ, không ghi đè
  }
  config = { ...config, ...patch }
  saveConfig()
  if ('lang' in patch && patch.lang !== before.lang) {
    buildTray()
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.setTitle(s().settingsWindowTitle)
  }
  if ('layout' in patch && patch.layout !== before.layout) { lastContentHeight = 120; buildTray() }
  if ('width' in patch || 'corner' in patch || 'layout' in patch) applyWindowGeometry()
  if ('alertWarnPct' in patch || 'alertCritPct' in patch) alertState.clear()
  if ('refreshApiMs' in patch || 'refreshLocalMs' in patch || 'refreshLocalProvidersMs' in patch) startTimers()
  if ('alwaysOnTop' in patch) applyAlwaysOnTop()
  if ('locked' in patch) applyLocked()
  if ('launchAtLogin' in patch) applyLoginItem()
  if ('followClaudeCli' in patch) restartFollowClaudeCliWatcher()
  // Bật/tắt một AI phải phản ánh ngay, không đợi hết nhịp 180 giây.
  if ('disabledProviders' in patch) {
    forecast.reset(); alertState.clear()
    // Bỏ ngay AI vừa tắt, không đợi vòng fetch mới trả về — xoá cả số TỐT đã nhớ, không thì bật
    // lại rồi mạng lỗi một lượt sẽ hiện nhầm số cũ của LẦN TRƯỚC hôm đó thay vì báo lỗi rõ ràng.
    lastProviders = providerState.removeProviders(config.disabledProviders)
    refreshApi(); refreshLocalProviders()
  }
  // Đổi trần ngữ cảnh phải tính lại NGAY, không đợi hết nhịp 8 giây — cài đặt ở app này áp trực tiếp.
  if ('contextLimit' in patch) refreshLocal()
  pushAll()
  return { ...config, hotkeyOk, strings: s() }
})
ipcMain.handle('reset-config', (e) => {
  if (!isSettingsSender(e)) return config
  config = { ...DEFAULTS }
  saveConfig(); forecast.reset(); alertState.clear()
  lastContentHeight = 120
  applyWindowGeometry(); registerHotkey(); applyAlwaysOnTop(); applyLocked(); applyLoginItem(); buildTray()
  // ★ Khôi phục mặc định đổi cả nhịp làm mới (`refreshApiMs`/`refreshLocalMs`/…) — phải khởi động
  // lại TIMER theo nhịp mới, không chỉ gọi refreshApi/refreshLocal một lần. Bản cũ không gọi
  // startTimers() ở đây: nếu trước đó đặt tay nhịp ngữ cảnh 120 giây rồi bấm "Khôi phục mặc
  // định", giao diện đổi về hiện "8 giây" nhưng timer nền vẫn chạy đúng 120 giây cho tới khi khởi
  // động lại app (codex soi ra 02/08). `startTimers()` tự gọi refreshApi()/refreshLocal() bên trong.
  startTimers()
  return config
})
// ★ Trả về Promise CHỜ XONG THẬT (mục 13) — nút ⟳ ở renderer bám theo lời gọi này để biết chính
// xác lúc nào đã lấy xong (có thể mất 15-20 giây, không phải 0,6 giây cố định như bản cũ).
ipcMain.handle('refresh-now', async (e) => {
  if (!isWidgetSender(e) && !isSettingsSender(e)) return { ok: false }   // cả 2 cửa sổ đều có nút ⟳
  return refreshNowResult()
})
// ---- Xuất/nhập cấu hình (mục 12) -------------------------------------------------
// `config.json` KHÔNG chứa token/credential nào cả — mọi provider (Claude/Codex/Antigravity) tự
// đọc token trực tiếp từ nơi CLI/IDE tương ứng đã lưu (xem src/providers/*.js), main.js chưa từng
// đụng vào hay lưu lại chúng. Vì vậy xuất NGUYÊN `config` là an toàn, không cần lọc field nào.
ipcMain.handle('export-config', async (e) => {
  if (!isSettingsSender(e)) return { ok: false }
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: s().exportDialogTitle, defaultPath: 'ai-usage-widget-config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (canceled || !filePath) return { ok: false }
  try { fs.writeFileSync(filePath, JSON.stringify(config, null, 2)); return { ok: true, filePath } }
  catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('import-config', async (e) => {
  if (!isSettingsSender(e)) return { ok: false }
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: s().importDialogTitle, properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (canceled || !filePaths || !filePaths[0]) return { ok: false }
  try {
    const raw = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'))
    const nextConfig = { ...DEFAULTS, ...sanitizeConfig(raw, DEFAULTS) }
    if (!trySwapHotkey(nextConfig.hotkey, config.hotkey)) {
      return { ok: false, error: i18n.fmt(s().importHotkeyFail, { hk: nextConfig.hotkey }) }
    }
    config = nextConfig
    saveConfig()
    lastContentHeight = 120
    applyWindowGeometry(); applyAlwaysOnTop(); applyLocked(); applyLoginItem(); buildTray()
    forecast.reset(); alertState.clear()
    startTimers()
    return { ok: true, config }
  } catch (e) { return { ok: false, error: e.message } }
})

// Dùng lúc KHỞI ĐỘNG app hoặc SAU reset-config — không có "hotkey cũ đang chạy tốt" cần giữ, nên
// cứ dọn sạch rồi đăng ký lại theo config hiện có.
function registerHotkey() {
  globalShortcut.unregisterAll()
  if (!config.hotkey) return true
  // Electron NÉM LỖI khi cú pháp phím sai (không trả false) → phải bọc, không được im lặng.
  try { return globalShortcut.register(config.hotkey, toggleWindow) } catch { return false }
}

// Dùng khi ĐỔI hotkey qua trang Cài đặt: đăng ký phím MỚI trước, chỉ hủy phím CŨ sau khi phím mới
// chắc chắn đăng ký được. Bản cũ lưu config rồi `unregisterAll()` trước khi thử phím mới — cú pháp
// sai hoặc bị app khác chiếm là mất luôn phím tốt trước đó, mà cấu hình lỗi vẫn đã nằm trên đĩa
// (codex soi ra 02/08).
function trySwapHotkey(newHotkey, oldHotkey) {
  return swapHotkey(globalShortcut, toggleWindow, newHotkey, oldHotkey)
}

// ★ Chỉ tự khởi động app khi file này ĐÚNG LÀ tiến trình chính, không phải bị `require()` từ nơi
//   khác (test/*.js có thể `require('../src/main.js')` để lấy các hàm THUẦN bên dưới — buildEntry,
//   trySwapHotkey… — phục vụ test hồi quy mà KHÔNG mở cửa sổ thật/không tạo Tray/không gọi mạng).
//   ⚠️ 29/08: `require.main === module` KHÔNG dùng được trong Electron — Electron tự nạp file
//   "main" của package.json qua bootstrap riêng, `require.main` trỏ vào module nội bộ của Electron
//   (filename = "electron") chứ không phải main.js, nên điều kiện này luôn SAI và app KHÔNG BAO GIỜ
//   khởi động thật (dò ra 29/08: cửa sổ/tray/timer chưa từng chạy, chỉ có icon Dock đứng im). Dùng
//   `!module.parent` thay thế — true khi file này được nạp trực tiếp (không ai `require()` nó),
//   false khi một file khác `require('./main.js')` gọi vào (đúng ý muốn ban đầu của guard này).
if (!module.parent) {
  app.whenReady().then(() => {
    loadConfig()
    if (app.dock) app.dock.hide()   // widget ở khay, không chiếm chỗ Dock
    createWindow()
    applyLoginItem()
    buildTray()
    registerHotkey()
    startTimers()
  })
  app.on('window-all-closed', (e) => { e.preventDefault?.() })   // sống ở khay, đóng cửa sổ không thoát
  app.on('before-quit', () => { isQuitting = true })   // cho close() thật đi qua khi bấm "Thoát"
  app.on('will-quit', () => globalShortcut.unregisterAll())
}

// Xuất hàm THUẦN cho test/main-logic.js — chỉ dùng trong tiến trình test (chạy qua
// `npx electron test/main-logic.js`), không ảnh hưởng gì tới app thật.
module.exports = {
  buildEntry, wrapStale, upsertProviders, reconcileProviders, trySwapHotkey, registerHotkey,
  refreshLocal, startTimers, providerGood, providerById,
  toggleWindow,
  getLastProviders: () => lastProviders, getConfig: () => config, setConfigForTest: (c) => { config = c },
}
