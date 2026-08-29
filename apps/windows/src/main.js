const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { computeTodayStats, computeSessions } = require('./usageTracker');
const providers = require('./providers');
const { getStrings, resolveLang, translateError } = require('./i18n');
const alerts = require('./alerts');
const forecast = require('./forecast');

// Avoid blank transparent overlays on Windows GPU compositing paths.
app.disableHardwareAcceleration();

// Chi cho phep mot phien app. Khi nguoi dung bam lai bieu tuong desktop,
// Electron se gui su kien second-instance cho phien dang chay thay vi tao
// them mot BrowserWindow/tray/hotkey moi.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

const bundledConfigPath = path.join(__dirname, '..', 'config.json');
// Khi dong goi, thu muc app la read-only -> luu config o userData (ghi duoc).
const userConfigPath = app.isPackaged
  ? path.join(app.getPath('userData'), 'config.json')
  : bundledConfigPath;

const DEFAULTS = {
  configVersion: 2,
  lang: 'auto',
  claudeDir: '',
  cacheReadWeight: 0.1,
  pollIntervalMs: 180000,
  localRefreshMs: 30000,
  contextLimitTokens: 1000000,
  sessionActiveMinutes: 30,
  corner: 'top-right',
  customPosition: null, // {x,y} sau khi nguoi dung tu keo widget di noi khac
  size: 'small',
  layout: 'standard',
  palette: 'default',
  accentColor: 'auto',
  opacity: 0.92,
  showContextBar: true,
  showTodayDetails: true,
  showSessions: true,
  maxSessions: 5,
  disabledProviders: [], // id cac AI nguoi dung tu tat trong Cai dat (rong = hien tat ca tim thay)
  localRefreshProvidersMs: 15000, // nhip lam moi rieng cho AI CUC BO (vd Antigravity) â€” nhanh hon san 180s
  alertsEnabled: true, // thong bao he thong khi sap cham han muc
  alertWarnPct: 80,
  alertCritPct: 95,
  showForecast: true, // du bao luc het quota theo toc do dung
  hotkeyToggle: 'Control+Alt+U', // phim tat an/hien widget ('' = tat)
};

function loadConfig() {
  let raw = {};
  try {
    if (fs.existsSync(userConfigPath)) {
      raw = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
    } else {
      raw = JSON.parse(fs.readFileSync(bundledConfigPath, 'utf8'));
    }
  } catch {
    raw = {};
  }
  const migrated = { ...raw };
  // Báº£n cÅ© khÃ´ng cÃ³ version vÃ  dÃ¹ng 200K lÃ m máº·c Ä‘á»‹nh. Chá»‰ nÃ¢ng giÃ¡ trá»‹
  // Ä‘Ãºng máº«u máº·c Ä‘á»‹nh cÅ©; cáº¥u hÃ¬nh Ä‘Ã£ cÃ³ version Ä‘Æ°á»£c coi lÃ  lá»±a chá»n rÃµ rÃ ng.
  if (!migrated.configVersion && migrated.contextLimitTokens === 200000) {
    migrated.contextLimitTokens = DEFAULTS.contextLimitTokens;
  }
  if (migrated.palette === 'nna') migrated.palette = 'espresso';
  if (!['compact', 'standard', 'dashboard', 'terminal'].includes(migrated.layout)) migrated.layout = 'standard';
  migrated.configVersion = DEFAULTS.configVersion;
  delete migrated.compact;
  const merged = { ...DEFAULTS, ...migrated };
  if (app.isPackaged) {
    try {
      fs.writeFileSync(userConfigPath, JSON.stringify(merged, null, 2));
    } catch {
      // ignore
    }
  }
  return merged;
}
function saveConfig() {
  try {
    fs.writeFileSync(userConfigPath, JSON.stringify(config, null, 2));
  } catch {
    // ignore write failures
  }
}

const WIDTHS = { small: 250, medium: 290, large: 330 };

let win;
let settingsWin;
let tray;
let config = loadConfig();
let pollTimer;
let expanded = false;
let manuallyHidden = false;
let visibilityWatchdog = null;

// ---- Tu phuc hoi khi renderer chet/treo -------------------------------------------
// Bug thay 06/08/2026: BrowserWindow con song, IsWindowVisible=true, dung vi tri, nhung
// renderer crash/treo am tham nen khong ve duoc gi (window transparent:true -> nhin xuyen
// qua nhu "bien mat", KHONG phai an binh thuong). main.js truoc day khong nghe cac su kien
// nay nen khong bao gio biet de tu cuu â€” nguoi dung phai tu tat/mo lai app bang tay.
// unresponsiveTimer/renderRecoveryCount o ngoai createWindow() vi window co the bi tao lai
// nhieu lan (moi lan tao la mot win moi), can trang thai xuyen suot cac lan do.
let unresponsiveTimer = null;
let renderRecoveryCount = 0;
let renderRecoveryResetTimer = null;
const RENDER_RECOVERY_LIMIT = 5; // qua nguong nay trong 5 phut -> thoi, tranh vong lap crash vo tan
const RENDER_RECOVERY_WINDOW_MS = 5 * 60 * 1000;
const UNRESPONSIVE_TIMEOUT_MS = 10000; // doi 10s cho 'responsive' truoc khi coi la treo that

if (gotSingleInstanceLock) {
app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    manuallyHidden = false;
    win.showInactive();
    applyWindowGeometry();
    keepWidgetOnTop();
    rebuildTrayMenu();
  });
}

const LAYOUT_WIDTH_BONUS = { compact: -35, standard: 0, dashboard: 150, terminal: 40 };

// Tinh kich thuoc theo cac muc dang bat + che do gon.
function collapsedSize() {
  const base = WIDTHS[config.size || 'small'] || 250;
  const w = base + (LAYOUT_WIDTH_BONUS[config.layout] || 0);
  const preset = config.layout || 'standard';
  const barH = preset === 'compact' ? 34 : preset === 'dashboard' ? 42 : 46;
  let bars = preset === 'compact' ? 2 : 3;
  if (config.showContextBar) bars += 1;
  const head = preset === 'compact' ? 36 : 50;
  const hint = 20;
  const pad = preset === 'compact' ? 16 : 24;
  return { w, h: head + bars * barH + hint + pad };
}

function expandedExtra() {
  if (config.layout === 'compact') return 0;
  let h = 0;
  if (config.showSessions) {
    h += 20 + (config.maxSessions || 5) * 16 + 6;
  }
  if (config.showTodayDetails) {
    h += 20 + 6 * 17 + 8;
  }
  return Math.max(80, h);
}

function currentCorner() {
  return config.corner || 'top-right';
}

function positionFor(corner, w, h) {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh, x: ox, y: oy } = display.workArea;
  const margin = 20;
  switch (corner) {
    case 'top-left':
      return { x: ox + margin, y: oy + margin };
    case 'bottom-left':
      return { x: ox + margin, y: oy + sh - h - margin };
    case 'bottom-right':
      return { x: ox + sw - w - margin, y: oy + sh - h - margin };
    case 'top-right':
    default:
      return { x: ox + sw - w - margin, y: oy + margin };
  }
}

// Vi tri tu keo (customPosition) luon neo GOC TREN-TRAI co dinh, noi dung dai them
// (them AI, them han muc) thi widget cao xuong PHIA DUOI. Neu khong ep het trong man
// hinh moi lan noi dung doi, canh duoi/phai co the troi qua khoi man hinh/thanh taskbar
// -> nguoi dung thay nhu bi "cat mat" du code hien thi dung, chi la khong con cho de ve.
// Nen moi lan tinh vi tri phai KEO LAI cho vua vao vung nhin thay, khong chi kiem tra qua loa.
function clampToVisibleArea(x, y, w, h) {
  const displays = screen.getAllDisplays();
  // Chon man hinh co diem (x,y) hien tai nam trong, khong thi lay man hinh gan nhat.
  let target = displays.find((d) => {
    const a = d.workArea;
    return x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height;
  });
  if (!target) {
    target = displays.reduce((best, d) => {
      const a = d.workArea;
      const cx = a.x + a.width / 2;
      const cy = a.y + a.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      return !best || dist < best.dist ? { d, dist } : best;
    }, null).d;
  }
  const a = target.workArea;
  const clampedX = Math.min(Math.max(x, a.x), a.x + a.width - w);
  const clampedY = Math.min(Math.max(y, a.y), a.y + a.height - h);
  return { x: clampedX, y: clampedY };
}

// Vi tri hien thi: uu tien cho nguoi dung da tu keo toi (customPosition),
// chua keo lan nao thi dung goc man hinh da chon (corner) lam vi tri "suggest" mac dinh.
function currentPosition(w, h) {
  if (config.customPosition && Number.isFinite(config.customPosition.x)) {
    return clampToVisibleArea(config.customPosition.x, config.customPosition.y, w, h);
  }
  return positionFor(currentCorner(), w, h);
}

let lastContentHeight = null;
let programmaticMove = false; // chan 'moved' tu cac lan chinh minh goi setBounds (khong phai nguoi dung keo)

function applyWindowGeometry() {
  if (!win || win.isDestroyed()) return;
  const { w, h } = collapsedSize();
  // Uu tien chieu cao do tu noi dung that; fallback tinh tay.
  const totalH = lastContentHeight || (expanded ? h + expandedExtra() : h);
  const { x, y } = currentPosition(w, totalH);
  programmaticMove = true;
  win.setBounds({ x, y, width: w, height: totalH });
  setTimeout(() => {
    programmaticMove = false;
  }, 500);
}

// Nguoi dung tu tay keo widget (giu drag-region roi tha) -> nho vi tri, khong tu quay ve goc nua.
function rememberDraggedPosition() {
  if (!win || win.isDestroyed() || programmaticMove) return;
  const { x, y } = win.getBounds();
  config.customPosition = { x, y };
  saveConfig();
}

// Windows đôi khi giữ overlay frameless ở dưới cửa sổ hiện tại dù
// BrowserWindow vẫn báo visible. Gọi lại TOPMOST + moveTop ở các điểm hiển thị
// quan trọng để widget thật sự nhìn thấy, không chỉ tồn tại trong danh sách cửa sổ.
function keepWidgetOnTop() {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(true);
  win.moveTop();
}

// Windows đôi khi tự đổi z-order hoặc ẩn frameless overlay sau khi đổi app,
// wake/resume hoặc đổi desktop ảo. Chỉ tự phục hồi khi người dùng không chủ
// động ẩn bằng hotkey.
function startVisibilityWatchdog() {
  if (visibilityWatchdog) clearInterval(visibilityWatchdog);
  visibilityWatchdog = setInterval(() => {
    if (!win || win.isDestroyed() || manuallyHidden) return;
    if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()) return;
    if (!win.isVisible()) win.showInactive();
    keepWidgetOnTop();
  }, 3000);
}

function createWindow() {
  const { w, h } = collapsedSize();
  const { x, y } = currentPosition(w, h);

  win = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    show: true,
    frame: false,
    transparent: false,
    backgroundColor: '#141414',
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  lockRenderer(win);

  win.setAlwaysOnTop(true);
  win.moveTop();
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setOpacity(config.opacity ?? 0.92);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Ghi nho vi tri sau khi nguoi dung tha chuot (khong ghi khi la minh tu doi bang applyWindowGeometry).
  win.on('moved', rememberDraggedPosition);

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('config', config);
    pushUpdate();
    keepWidgetOnTop();
  });
  win.on('ready-to-show', keepWidgetOnTop);

  // Trang load loi (vd file renderer bi thieu/hong sau cai dat lem) -> thu load lai 1 lan,
  // dung lam vong lap neu van loi tiep (errorCode -3 la ABORTED, thuong do minh tu huy khi
  // dang tao lai cua so â€” bo qua).
  let didRetryLoad = false;
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode === -3) return;
    if (didRetryLoad) {
      console.error('[widget] did-fail-load lan 2, bo cuoc:', errorCode, errorDescription);
      return;
    }
    didRetryLoad = true;
    console.error('[widget] did-fail-load, thu lai:', errorCode, errorDescription);
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    }, 1000);
  });

  // Renderer crash/bi he dieu hanh giet (OOM, GPU loi...) -> cua so con nhung trong rong.
  win.webContents.on('render-process-gone', (event, details) => {
    setImmediate(() => recreateWindow(`render-process-gone:${details && details.reason}`));
  });

  // Renderer treo (dang chay nhung khong phan hoi) -> cho mot chut xem no tu hoi phuc
  // (Chromium tu ban se ban 'responsive' lai) khong thi coi nhu chet, tao cua so moi.
  win.webContents.on('unresponsive', () => {
    if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
    const target = win;
    unresponsiveTimer = setTimeout(() => {
      unresponsiveTimer = null;
      if (win === target && win && !win.isDestroyed()) {
        recreateWindow('unresponsive-timeout');
      }
    }, UNRESPONSIVE_TIMEOUT_MS);
  });
  win.webContents.on('responsive', () => {
    if (unresponsiveTimer) {
      clearTimeout(unresponsiveTimer);
      unresponsiveTimer = null;
    }
  });
}

// Dem so lan tu phuc hoi trong 1 cua so 5 phut â€” qua nguong thi ngung, tranh crash-loop
// an het CPU/RAM thay vi giup nguoi dung.
function noteRenderRecovery() {
  renderRecoveryCount += 1;
  if (renderRecoveryResetTimer) clearTimeout(renderRecoveryResetTimer);
  renderRecoveryResetTimer = setTimeout(() => {
    renderRecoveryCount = 0;
  }, RENDER_RECOVERY_WINDOW_MS);
  return renderRecoveryCount;
}

// Tao lai cua so widget tu dau sau khi renderer chet/treo, giu nguyen watcher/tray/config.
// (giong het luc app moi khoi dong), nen khong co khoang trong nao "quen" hay "sai" ca.
function recreateWindow(reason) {
  const count = noteRenderRecovery();
  if (count > RENDER_RECOVERY_LIMIT) {
    console.error('[widget] renderer cu loi lap lai, ngung tu phuc hoi:', reason, `(${count} lan/5 phut)`);
    return;
  }
  console.error(`[widget] dang tu phuc hoi cua so (lan ${count}/${RENDER_RECOVERY_LIMIT}):`, reason);
  try {
    if (win && !win.isDestroyed()) {
      win.removeAllListeners();
      win.destroy();
    }
  } catch {
    // ignore
  }
  createWindow();
  rebuildTrayMenu();
}

// Ap dung config moi cho widget dang chay (goi khi luu cai dat).
// ---- Phim tat an/hien widget ----------------------------------------------
// Dang ky lai moi lan doi cai dat. Phim sai cu phap hoac bi app khac chiem -> Electron
// nem loi hoac tra false; luu vao hotkeyOk de Cai dat bao cho nguoi dung biet, KHONG im lang.
let hotkeyOk = true;
let registeredHotkey = null;

function toggleWidget() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) {
    manuallyHidden = true;
    win.hide();
  }
  else {
    manuallyHidden = false;
    win.showInactive();
    applyWindowGeometry();
    keepWidgetOnTop();
  }
  rebuildTrayMenu();
}

function applyHotkey() {
  try {
    if (registeredHotkey) globalShortcut.unregister(registeredHotkey);
  } catch {
    // ignore
  }
  registeredHotkey = null;
  const accel = (config.hotkeyToggle || '').trim();
  if (!accel) {
    hotkeyOk = true;
    return;
  }
  try {
    hotkeyOk = globalShortcut.register(accel, toggleWidget);
    if (hotkeyOk) registeredHotkey = accel;
  } catch {
    hotkeyOk = false;
  }
}

function applyConfigToWidget() {
  if (win && !win.isDestroyed()) {
    win.setOpacity(config.opacity ?? 0.92);
    win.webContents.send('config', config);
  }
  applyWindowGeometry();
  pushUpdate();
  rebuildTrayMenu();
}

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 380,
    height: Math.min(760, Math.max(560, screen.getPrimaryDisplay().workArea.height - 80)),
    title: getStrings(config.lang, app.getLocale()).settingsTitle,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  lockRenderer(settingsWin);
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.webContents.on('did-finish-load', () => {
    settingsWin.webContents.send('settings-data', {
      config,
      autostart: app.getLoginItemSettings().openAtLogin,
      strings: getStrings(config.lang, app.getLocale()),
      providerCatalog: providers.ALL.map((p) => ({ id: p.id, name: p.name })),
      hotkeyOk,
    });
  });
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

// Chuoi da dich theo cai dat ngon ngu
function S() {
  return getStrings(config.lang, app.getLocale());
}

let lastProviders = []; // ket qua usage cua cac AI tim thay
let lastFetchError = null; // { message, at } - loi lan refresh gan nhat (KHONG xoa lastProviders)
let hasFetchedOnce = false;
let fetchInFlight = false;

// usageTracker đọc đồng bộ các transcript JSONL. Không được chạy lại toàn bộ
// cây dữ liệu mỗi 8 giây: khi transcript lớn dần, việc parse sẽ khóa main event loop
// và làm widget trông như bị treo. Cache này chỉ làm mới tối đa mỗi 30 giây.
const LOCAL_STATS_MIN_INTERVAL_MS = 30000;
let localStatsCache = {
  at: 0,
  hasClaude: false,
  today: {},
  sessionData: { sessions: [], current: null, contextLimit: 1000000, contextLimitSource: 'config' },
};

function getLocalStatsSnapshot(hasClaude) {
  const empty = { today: {}, sessionData: { sessions: [], current: null, contextLimit: 1000000, contextLimitSource: 'config' } };
  if (!hasClaude) return empty;
  const now = Date.now();
  const refreshMs = Math.max(LOCAL_STATS_MIN_INTERVAL_MS, Number(config.localRefreshMs) || LOCAL_STATS_MIN_INTERVAL_MS);
  if (localStatsCache.hasClaude && now - localStatsCache.at < refreshMs) {
    return { today: localStatsCache.today, sessionData: localStatsCache.sessionData };
  }
  let today = {};
  let sessionData = empty.sessionData;
  try {
    today = computeTodayStats(config);
  } catch {
    today = {};
  }
  try {
    sessionData = computeSessions(config);
  } catch {
    // Giữ snapshot mặc định nếu transcript đang được ghi dở hoặc file lỗi.
  }
  localStatsCache = { at: now, hasClaude: true, today, sessionData };
  return { today, sessionData };
}

// Goi mang: lay usage cua MOI AI tim thay tren may nay.
// Loi CUA TUNG provider (mang, token het han...) da duoc providers.fetchAll() tu bat va
// tra ve {error} cho muc do â€” khong lam hong cac provider khac. Catch o day chi bat loi
// BAT NGO o tang goi tong (vd bug), nen KHONG duoc xoa sach lastProviders: 1 lan loi thoang
// qua khong co nghia la mat het usage dang hien, chi can bao "du lieu cu/loi" ben canh.
async function refreshProviders() {
  if (fetchInFlight) return;
  fetchInFlight = true;
  try {
    lastProviders = await providers.fetchAll(config);
    lastFetchError = null;
    hasFetchedOnce = true;
  } catch (e) {
    lastFetchError = { message: String((e && e.message) || e), at: Date.now() };
    if (!hasFetchedOnce) {
      // Chua lan nao thanh cong -> khong co gi cu de giu, bao loi ro thay vi trang.
      lastProviders = [{ providerId: 'system', providerName: 'AI', error: lastFetchError.message }];
    }
  } finally {
    fetchInFlight = false;
  }
}

let localFetchInFlight = false;
// Lam moi rieng cac AI CUC BO (vd Antigravity) â€” nhanh hon nhieu so voi san 180s cua
// refreshProviders(), vi khong goi may chu tu xa nen khong so rate-limit. Chi CAP NHAT
// (khong thay the) cac muc tuong ung trong lastProviders, giu nguyen ket qua Claude/Codex.
async function refreshLocalProviders() {
  if (localFetchInFlight) return;
  localFetchInFlight = true;
  try {
    const results = await providers.fetchLocal(config);
    for (const r of results) {
      const idx = lastProviders.findIndex((p) => p.providerId === r.providerId);
      if (idx >= 0) lastProviders[idx] = r;
      else lastProviders.push(r);
    }
    // AI cuc bo vua bi tat (trong Cai dat) hoac vua dong app cua no -> bo khoi danh sach hien thi
    const localIds = new Set(providers.ALL.filter((p) => p.local).map((p) => p.id));
    const stillFound = new Set(results.map((r) => r.providerId));
    lastProviders = lastProviders.filter((p) => !localIds.has(p.providerId) || stillFound.has(p.providerId));
  } catch {
    // giu nguyen lastProviders cu, dung xoa sach vi 1 lan loi cuc bo
  } finally {
    localFetchInFlight = false;
  }
}

// Gui du lieu ra widget. Context/session/today tinh local moi lan; usage dung cache.
function pushUpdate() {
  const s = S();
  const hasClaude = lastProviders.some((p) => p.providerId === 'claude' && !p.error);
  const anyProviderFound = providers.detectAvailable(config).length > 0;

  // Thống kê local được cache/throttle để không khóa main process khi transcript lớn.
  const localStats = getLocalStatsSnapshot(hasClaude);
  const today = localStats.today;
  const sessionData = localStats.sessionData;

  // Provider dau tien (luon la Claude neu co) van giu o cac field cu (tuong thich nguoc,
  // va vi thong ke local/session/context chi tinh duoc cho Claude Code).
  const primary = lastProviders[0] || null;

  // Dot 3: hien TAT CA AI tim thay, khong chi cai dau tien.
  const providerList = lastProviders.map((p) => ({
    providerId: p.providerId,
    providerName: p.providerName,
    plan: !p.error ? p.plan : null,
    error: p.error ? translateError(p.error, s) : null,
    fiveHourPct: !p.error ? p.fiveHourPct : null,
    weeklyPct: !p.error ? p.weeklyPct : null,
    fiveHourResetAt: !p.error ? p.fiveHourResetAt : null,
    weeklyResetAt: !p.error ? p.weeklyResetAt : null,
    scopedLimits: !p.error ? p.scopedLimits || [] : [],
  }));

  // Canh bao sap cham han muc (module tu chong spam â€” xem alerts.js)
  try {
    alerts.notify(alerts.checkAlerts(providerList, config, s), s);
  } catch {
    // canh bao hong khong duoc lam sap luong hien thi
  }

  // Du bao luc het quota theo toc do dung hien tai (chi hien khi do duoc that)
  let forecasts = {};
  try {
    if (config.showForecast !== false) forecasts = forecast.update(providerList);
  } catch {
    forecasts = {};
  }

  const data = {
    strings: s,
    noAiFound: !anyProviderFound,
    fetchError: lastFetchError ? lastFetchError.message : null,
    providers: providerList,
    forecasts,
    providerName: primary ? primary.providerName : null,
    plan: primary && !primary.error ? primary.plan : null,
    error: primary && primary.error ? translateError(primary.error, s) : null,

    fiveHourPct: primary && !primary.error ? primary.fiveHourPct : null,
    weeklyPct: primary && !primary.error ? primary.weeklyPct : null,
    fiveHourResetAt: primary && !primary.error ? primary.fiveHourResetAt : null,
    weeklyResetAt: primary && !primary.error ? primary.weeklyResetAt : null,
    scopedLimits: primary && !primary.error ? primary.scopedLimits || [] : [],

    ...today,
    sessions: sessionData.sessions,
    currentContext: sessionData.current,
    contextLimit: sessionData.contextLimit,
    contextLimitSource: sessionData.contextLimitSource,
    updatedAt: Date.now(),
  };

  if (win && !win.isDestroyed()) win.webContents.send('usage-update', data);
}

function rebuildTrayMenu() {
  const s = S();
  const cornerLabel = {
    'top-right': s.cornerTopRight,
    'top-left': s.cornerTopLeft,
    'bottom-right': s.cornerBottomRight,
    'bottom-left': s.cornerBottomLeft,
  };
  const sizeLabel = { small: s.sizeSmall, medium: s.sizeMedium, large: s.sizeLarge };

  const cornerItems = Object.keys(cornerLabel).map((key) => ({
    label: cornerLabel[key],
    type: 'radio',
    checked: currentCorner() === key,
    click: () => {
      config.corner = key;
      config.customPosition = null; // chon goc = quay ve vi tri suggest, huy vi tri da tu keo
      saveConfig();
      applyWindowGeometry();
    },
  }));

  const sizeItems = Object.keys(sizeLabel).map((key) => ({
    label: sizeLabel[key],
    type: 'radio',
    checked: (config.size || 'small') === key,
    click: () => {
      config.size = key;
      saveConfig();
      applyWindowGeometry();
    },
  }));

  const menu = Menu.buildFromTemplate([
    { label: s.traySettings, click: createSettingsWindow },
    {
      label: s.trayRefresh,
      click: async () => {
        await refreshProviders();
        pushUpdate();
      },
    },
    { type: 'separator' },
    { label: s.trayPosition, submenu: cornerItems },
    { label: s.traySize, submenu: sizeItems },
    { type: 'separator' },
    {
      label: s.trayPin,
      type: 'checkbox',
      checked: true,
      click: (item) => win.setAlwaysOnTop(item.checked),
    },
    {
      label: s.trayAutostart,
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: s.trayQuit, click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

const TRAY_ICON_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAlUlEQVR4Ae3aQQoAIAgF0enk3fkkbSJq0aKF/wm+VUJBHy2AKq21ub2rGXlG5N4hZM6d0EQAKR8ByBIKKYWQAqCXQEwYQQhIVYSK8OGDCEDPn0AbEUAvgU4igF4CnUQAvQQ6iQB6CXQSAfQS6CQC6CXQSQTQS6CTCKCXQCcRQC+BTiKAXgKdRAC9BDqJAHoJdBIBjgL9Lqbk1kR0LtQAAAAASUVORK5CYII=';

function trayImage() {
  const p = path.join(__dirname, 'renderer', 'tray.png');
  try {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  } catch {
    // roi ve icon du phong
  }
  return nativeImage.createFromDataURL('data:image/png;base64,' + TRAY_ICON_B64);
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('AI Usage Widget');
  rebuildTrayMenu();
}

// Endpoint /api/oauth/usage bi 429 neu goi < 180s -> ep san toi thieu.
function effectivePoll() {
  return Math.max(180000, config.pollIntervalMs || 180000);
}

let localTimer;
let localProvidersTimer;
if (gotSingleInstanceLock) app.whenReady().then(async () => {
  createWindow();
  startVisibilityWatchdog();
  createTray();
  applyHotkey();
  // Nhip cham: goi API usage tu xa (Claude/Codex, toi thieu 180s vi rate-limit)
  await refreshProviders();
  pushUpdate();
  pollTimer = setInterval(async () => {
    await refreshProviders();
    pushUpdate();
  }, effectivePoll());
  // Nhip rieng, nhanh hon nhieu cho AI CUC BO (vd Antigravity) â€” khong bi san 180s vi
  // khong goi may chu tu xa nen khong lo rate-limit. Nho cai nay thi vua mo Antigravity
  // len la thay ngay, khong phai doi ca chu ky 180s cua Claude/Codex.
  await refreshLocalProviders();
  pushUpdate();
  localProvidersTimer = setInterval(async () => {
    await refreshLocalProviders();
    pushUpdate();
  }, config.localRefreshProvidersMs || 15000);
  // Nhip nhanh: context/session/today lam moi local (mac dinh 8s), khong goi mang
  localTimer = setInterval(pushUpdate, Math.max(LOCAL_STATS_MIN_INTERVAL_MS, config.localRefreshMs || LOCAL_STATS_MIN_INTERVAL_MS));
});

function lockRenderer(browserWindow) {
  browserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  browserWindow.webContents.on('will-navigate', (event) => event.preventDefault());
}

function senderPath(event) {
  try {
    return decodeURIComponent(new URL(event.senderFrame ? event.senderFrame.url : '').pathname);
  } catch {
    return '';
  }
}
const isWidgetSender = (event) => senderPath(event).endsWith('/renderer/index.html');
const isSettingsSender = (event) => senderPath(event).endsWith('/renderer/settings.html');

const { sanitizeSettingsPatch: sanitizeSettingsPatchPure } = require('./configSchema');
// Boc lai voi danh sach provider hop le hien tai — file configSchema.js tach rieng de test bang
// Node thuan (xem apps/windows/test/config-schema.js), khong tu require('./providers') o trong do.
function sanitizeSettingsPatch(raw) {
  return sanitizeSettingsPatchPure(raw, providers.ALL.map((provider) => provider.id));
}

ipcMain.on('toggle-expand', (event, value) => {
  if (!isWidgetSender(event)) return;
  expanded = value;
  // renderer se do lai chieu cao va bao qua 'content-height'
});

ipcMain.on('content-height', (event, h) => {
  if (!isWidgetSender(event)) return;
  const value = Number(h);
  if (!Number.isFinite(value)) return;
  const clamped = Math.max(80, Math.min(1200, Math.round(value)));
  lastContentHeight = clamped;
  applyWindowGeometry();
});

ipcMain.on('open-settings', (event) => {
  if (isWidgetSender(event)) createSettingsWindow();
});

ipcMain.on('refresh-now', async (event) => {
  if (!isWidgetSender(event)) return;
  await refreshProviders();
  pushUpdate();
});

ipcMain.on('close-window', (event) => {
  if (isWidgetSender(event)) app.quit();
});

// Khoi phuc mac dinh (giu lai duong dan claude neu nguoi dung da chinh)
ipcMain.on('reset-settings', (event) => {
  if (!isSettingsSender(event)) return;
  const keep = { claudeDir: config.claudeDir };
  config = { ...DEFAULTS, ...keep };
  lastContentHeight = null;
  saveConfig();
  applyConfigToWidget();
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings-data', {
      config,
      autostart: app.getLoginItemSettings().openAtLogin,
      strings: getStrings(config.lang, app.getLocale()),
      providerCatalog: providers.ALL.map((p) => ({ id: p.id, name: p.name })),
      hotkeyOk,
    });
  }
});

// Nhan config moi tu cua so cai dat -> merge, luu, ap dung ngay (live).
ipcMain.on('save-settings', (event, payload) => {
  if (!isSettingsSender(event)) return;
  const { config: rawConfig, autostart } = payload || {};
  const newConfig = sanitizeSettingsPatch(rawConfig);
  let disabledProvidersChanged = false;
  let langChanged = false;
  let echoBack = false;
  let intervalsChanged = false;
  if (newConfig && typeof newConfig === 'object') {
    // Doi bo cuc/che do gon -> chieu cao cu khong con dung, do lai tu dau
    if (newConfig.layout !== config.layout) {
      lastContentHeight = null;
    }
    // Nguoi dung tu chon goc khac trong Cai dat -> coi nhu muon quay ve vi tri suggest, huy vi tri da tu keo
    if (newConfig.corner && newConfig.corner !== config.corner) {
      config.customPosition = null;
    }
    if (
      newConfig.disabledProviders &&
      JSON.stringify([...newConfig.disabledProviders].sort()) !== JSON.stringify([...(config.disabledProviders || [])].sort())
    ) {
      disabledProvidersChanged = true;
    }
    // Doi nguong canh bao -> quen trang thai "da bao roi", de nguong moi co hieu luc ngay
    if (
      newConfig.alertWarnPct !== config.alertWarnPct ||
      newConfig.alertCritPct !== config.alertCritPct ||
      newConfig.alertsEnabled !== config.alertsEnabled
    ) {
      alerts.resetState();
    }
    const hotkeyChanged = newConfig.hotkeyToggle !== config.hotkeyToggle;
    langChanged = newConfig.lang !== undefined && newConfig.lang !== config.lang;
    echoBack = langChanged || hotkeyChanged;
    // Chi dat lai timer khi 1 chu ky lam moi thuc su doi (cac key nay khong co
    // trong man Cai dat -> thuong khong bao gio doi khi luu). Truoc day reset
    // moi lan luu -> cu go/keo la day lui lan refresh API 180s.
    const changed = (k) => Object.prototype.hasOwnProperty.call(newConfig, k) && newConfig[k] !== config[k];
    intervalsChanged = changed('pollIntervalMs') || changed('localRefreshProvidersMs') || changed('localRefreshMs');
    config = { ...config, ...newConfig };
    saveConfig();
    if (hotkeyChanged) applyHotkey();
  }
  if (typeof autostart === 'boolean') {
    try {
      app.setLoginItemSettings({ openAtLogin: autostart });
    } catch {
      // ignore
    }
  }
  // Chi dat lai timer khi chu ky poll thuc su doi (toi thieu 180s cho API usage)
  if (intervalsChanged) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      await refreshProviders();
      pushUpdate();
    }, effectivePoll());
    if (localProvidersTimer) clearInterval(localProvidersTimer);
    localProvidersTimer = setInterval(async () => {
      await refreshLocalProviders();
      pushUpdate();
    }, config.localRefreshProvidersMs || 15000);
    if (localTimer) clearInterval(localTimer);
    localTimer = setInterval(pushUpdate, Math.max(LOCAL_STATS_MIN_INTERVAL_MS, config.localRefreshMs || LOCAL_STATS_MIN_INTERVAL_MS));
  }

  // Bat/tat 1 AI trong Cai dat -> phan anh NGAY, khong doi het chu ky 180s
  if (disabledProvidersChanged) {
    Promise.all([refreshProviders(), refreshLocalProviders()]).then(pushUpdate);
  }

  applyConfigToWidget();

  // CHI gui nguoc settings-data khi doi ngon ngu (dich lai nhan) hoac doi phim tat
  // (hien dong bao phim loi). KHONG gui khi keo slider/chon mau/go so -> tranh
  // dung lai toan bo DOM cai dat moi ~120ms lam giao dien giat, kho thao tac.
  if (echoBack && settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings-data', {
      config,
      autostart: app.getLoginItemSettings().openAtLogin,
      strings: getStrings(config.lang, app.getLocale()),
      providerCatalog: providers.ALL.map((p) => ({ id: p.id, name: p.name })),
      hotkeyOk,
    });
  }
});

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // ignore
  }
});

app.on('window-all-closed', () => {
  if (pollTimer) clearInterval(pollTimer);
  if (localProvidersTimer) clearInterval(localProvidersTimer);
  if (localTimer) clearInterval(localTimer);
  app.quit();
});



