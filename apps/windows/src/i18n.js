// Song ngu Viet / English. main.js dung cho tray, va gui dict sang renderer.

const vi = {
  appTitle: 'AI Usage Widget',
  loading: 'Đang lấy số thật...',
  realFromApi: 'Số thật từ API',
  staleData: 'dữ liệu cũ',

  contextWindow: 'Context window',
  fiveHour: 'Giới hạn 5 giờ',
  weeklyAll: 'Tuần (mọi model)',
  weeklyScoped: 'Tuần',
  resetAt: 'Khôi phục lúc',
  resetIn: 'còn',
  noSession: 'không có phiên',

  expandMore: '▾ Chi tiết phiên & hôm nay',
  expandLess: '▴ Thu gọn',
  sessionsTitle: 'Phiên đang mở (context)',
  noActiveSession: 'Không có phiên hoạt động',
  todayTitle: 'Chi tiết hôm nay',
  todayTokens: 'Token hôm nay',
  todayCost: 'Chi phí ước tính',
  todayMsgs: 'Tin nhắn / Phiên',
  burnRate: 'Tốc độ đốt token',
  perMin: 'tok/phút',
  updatedAt: 'Cập nhật',

  // Empty state
  noAiTitle: 'Chưa tìm thấy AI nào',
  noAiBody:
    'Cần cài và ĐĂNG NHẬP Claude Code trên máy này — bản desktop (có giao diện) hoặc bản CLI đều được.',
  noAiHint: 'Chỉ mở claude.ai trên trình duyệt thì chưa đủ. Cài xong, đăng nhập rồi bấm Làm mới.',
  refresh: 'Làm mới',

  // Loi
  errExpired: 'Token hết hạn — mở lại Claude Code để đăng nhập',
  errRateLimited: 'Gọi quá dày, chờ ~3 phút',
  errNoToken: 'Không tìm thấy token đăng nhập',
  errCredRead: 'Không đọc được file đăng nhập',
  errNetwork: 'Lỗi mạng',
  errTimeout: 'Quá thời gian chờ',
  errNotRunning: 'Chưa mở app này',
  errUnsupportedOs: 'Chưa hỗ trợ trên hệ điều hành này',
  errOther: 'Lỗi',

  // Tray
  traySettings: 'Cài đặt...',
  trayRefresh: 'Làm mới ngay',
  trayPosition: 'Vị trí',
  traySize: 'Kích thước',
  trayPin: 'Ghim trên cùng',
  trayAutostart: 'Tự khởi động cùng máy',
  trayQuit: 'Thoát',
  cornerTopRight: 'Phải trên',
  cornerTopLeft: 'Trái trên',
  cornerBottomRight: 'Phải dưới',
  cornerBottomLeft: 'Trái dưới',
  sizeSmall: 'Nhỏ',
  sizeMedium: 'Vừa',
  sizeLarge: 'Lớn',

  // Settings
  settingsTitle: 'Cài đặt AI Usage Widget',
  brandSubtitle: 'Theo dõi hạn mức AI theo thời gian thực',
  settingsModeCompact: 'Gọn',
  settingsModeFull: 'Đủ',
  groupAppearance: 'Giao diện',
  groupProviders: 'AI hiển thị',
  groupDisplay: 'Hiển thị',
  groupData: 'Dữ liệu',
  groupSystem: 'Hệ thống',
  language: 'Ngôn ngữ',
  langAuto: 'Tự động (theo máy)',
  langVi: 'Tiếng Việt',
  langEn: 'English',
  layout: 'Bố cục',
  layoutCompact: 'Gọn',
  layoutStandard: 'Tiêu chuẩn',
  layoutDashboard: 'Dashboard',
  layoutTerminal: 'Terminal',
  palette: 'Bảng màu',
  palDefault: 'Mặc định',
  palEspresso: 'Espresso (thương hiệu)',
  palLight: 'Sáng',
  palCatppuccin: 'Catppuccin',
  palDracula: 'Dracula',
  palNord: 'Nord',
  palGruvbox: 'Gruvbox',
  palClaude: 'Claude · Ember',
  palCodex: 'Codex · Oceanic',
  palGrok: 'Grok · Monochrome',
  palGemini: 'Gemini · Aurora',
  palAntigravity: 'Antigravity · Mint',
  useCustomAccent: 'Dùng màu nhấn riêng',
  position: 'Vị trí góc',
  size: 'Kích thước',
  opacity: 'Độ trong suốt',
  accentColor: 'Màu nhấn',
  showContextBar: 'Thanh Context window',
  showSessions: 'Danh sách phiên đang mở',
  showTodayDetails: 'Chi tiết hôm nay',
  maxSessions: 'Số phiên hiện tối đa',
  contextLimit: 'Giới hạn context (token)',
  contextLimitConfigured: 'giới hạn cấu hình',
  contextRemaining: 'còn lại',
  sessionActive: 'Phiên coi là "đang mở" trong (phút)',
  autostart: 'Tự khởi động cùng máy',
  save: 'Lưu & áp dụng',
  saved: '✓ Đã lưu',
  resetDefaults: 'Khôi phục mặc định',
  applied: '✓ Đã áp dụng',
  liveHint: 'Chỉnh tới đâu, widget đổi ngay tới đó — tự lưu, không cần bấm gì.',

  // Canh bao han muc
  groupAlerts: 'Cảnh báo hạn mức',
  alertsEnabled: 'Bật thông báo khi sắp chạm hạn mức',
  alertWarnPct: 'Ngưỡng cảnh báo (%)',
  alertCritPct: 'Ngưỡng nguy cấp (%)',
  alertWarnTitle: '⚠ Sắp chạm hạn mức',
  alertCritTitle: '🔴 Sắp hết hạn mức!',
  alertHint: 'Mỗi cửa sổ hạn mức chỉ báo một lần cho mỗi mức, báo lại sau khi reset.',
  showForecast: 'Dự báo lúc hết quota',
  forecastEta: 'hết ~',
  forecastHint: 'Chỉ hiện khi đo được tốc độ dùng thật và sẽ hết TRƯỚC lúc reset.',

  // Phim tat
  hotkeyToggle: 'Phím tắt ẩn/hiện widget',
  hotkeyHint: 'Ví dụ: Control+Alt+U · CommandOrControl+Shift+U. Để trống là tắt.',
  hotkeyBad: '⚠ Phím tắt không dùng được (sai cú pháp hoặc app khác đã chiếm)',

  // Dong bo voi Claude CLI
};

const en = {
  appTitle: 'AI Usage Widget',
  loading: 'Fetching live usage...',
  realFromApi: 'Live from API',
  staleData: 'stale data',

  contextWindow: 'Context window',
  fiveHour: '5-Hour Limit',
  weeklyAll: 'Weekly (All Models)',
  weeklyScoped: 'Weekly',
  resetAt: 'Resets at',
  resetIn: 'in',
  noSession: 'no session',

  expandMore: '▾ Sessions & today',
  expandLess: '▴ Collapse',
  sessionsTitle: 'Open sessions (context)',
  noActiveSession: 'No active session',
  todayTitle: "Today's details",
  todayTokens: 'Tokens today',
  todayCost: 'Estimated cost',
  todayMsgs: 'Messages / Sessions',
  burnRate: 'Burn rate',
  perMin: 'tok/min',
  updatedAt: 'Updated',

  noAiTitle: 'No AI found',
  noAiBody:
    'You need Claude Code installed and SIGNED IN on this machine — either the desktop app or the CLI works.',
  noAiHint: 'Opening claude.ai in a browser is not enough. Install, sign in, then hit Refresh.',
  refresh: 'Refresh',

  errExpired: 'Token expired — reopen Claude Code to sign in',
  errRateLimited: 'Polled too often, wait ~3 min',
  errNoToken: 'No sign-in token found',
  errCredRead: 'Cannot read credentials file',
  errNetwork: 'Network error',
  errTimeout: 'Request timed out',
  errNotRunning: 'App not currently running',
  errUnsupportedOs: 'Not supported on this OS yet',
  errOther: 'Error',

  traySettings: 'Settings...',
  trayRefresh: 'Refresh now',
  trayPosition: 'Position',
  traySize: 'Size',
  trayPin: 'Always on top',
  trayAutostart: 'Start with system',
  trayQuit: 'Quit',
  cornerTopRight: 'Top right',
  cornerTopLeft: 'Top left',
  cornerBottomRight: 'Bottom right',
  cornerBottomLeft: 'Bottom left',
  sizeSmall: 'Small',
  sizeMedium: 'Medium',
  sizeLarge: 'Large',

  settingsTitle: 'AI Usage Widget Settings',
  brandSubtitle: 'Real-time AI usage and quota monitor',
  settingsModeCompact: 'Simple',
  settingsModeFull: 'Full',
  groupAppearance: 'Appearance',
  groupProviders: 'AI shown',
  groupDisplay: 'Display',
  groupData: 'Data',
  groupSystem: 'System',
  language: 'Language',
  langAuto: 'Auto (system)',
  langVi: 'Vietnamese',
  langEn: 'English',
  layout: 'Layout',
  layoutCompact: 'Compact',
  layoutStandard: 'Standard',
  layoutDashboard: 'Dashboard',
  layoutTerminal: 'Terminal',
  palette: 'Color palette',
  palDefault: 'Default',
  palEspresso: 'Espresso (brand)',
  palLight: 'Light',
  palCatppuccin: 'Catppuccin',
  palDracula: 'Dracula',
  palNord: 'Nord',
  palGruvbox: 'Gruvbox',
  palClaude: 'Claude · Ember',
  palCodex: 'Codex · Oceanic',
  palGrok: 'Grok · Monochrome',
  palGemini: 'Gemini · Aurora',
  palAntigravity: 'Antigravity · Mint',
  useCustomAccent: 'Custom accent color',
  position: 'Corner',
  size: 'Size',
  opacity: 'Opacity',
  accentColor: 'Accent color',
  showContextBar: 'Context window bar',
  showSessions: 'Open sessions list',
  showTodayDetails: "Today's details",
  maxSessions: 'Max sessions shown',
  contextLimit: 'Context limit (tokens)',
  contextLimitConfigured: 'configured limit',
  contextRemaining: 'remaining',
  sessionActive: 'Treat session as "open" within (minutes)',
  autostart: 'Start with system',
  save: 'Save & apply',
  saved: '✓ Saved',
  resetDefaults: 'Reset to defaults',
  applied: '✓ Applied',
  liveHint: 'Changes apply to the widget instantly and save themselves.',

  groupAlerts: 'Limit alerts',
  alertsEnabled: 'Notify me when a limit is close',
  alertWarnPct: 'Warning threshold (%)',
  alertCritPct: 'Critical threshold (%)',
  alertWarnTitle: '⚠ Limit is getting close',
  alertCritTitle: '🔴 Limit almost reached!',
  alertHint: 'Each limit window alerts once per level, and again after it resets.',
  showForecast: 'Forecast when quota runs out',
  forecastEta: 'runs out ~',
  forecastHint: 'Only shown when a real burn rate is measured and it would run out before reset.',

  hotkeyToggle: 'Show/hide hotkey',
  hotkeyHint: 'e.g. Control+Alt+U · CommandOrControl+Shift+U. Empty disables it.',
  hotkeyBad: '⚠ Hotkey unavailable (bad syntax or taken by another app)',
};

const DICTS = { vi, en };

// lang: 'auto' | 'vi' | 'en'. systemLocale vi du 'vi-VN', 'en-US'.
function resolveLang(lang, systemLocale) {
  if (lang === 'vi' || lang === 'en') return lang;
  return String(systemLocale || '').toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

function getStrings(lang, systemLocale) {
  return DICTS[resolveLang(lang, systemLocale)];
}

// Map ma loi ky thuat -> chuoi da dich
function translateError(code, s) {
  const c = String(code || '');
  if (c.startsWith('EXPIRED')) return s.errExpired;
  if (c.startsWith('RATE_LIMITED')) return s.errRateLimited;
  if (c.startsWith('NO_TOKEN')) return s.errNoToken;
  if (c.startsWith('CRED_READ')) return s.errCredRead;
  if (c.startsWith('NETWORK')) return s.errNetwork;
  if (c.startsWith('TIMEOUT')) return s.errTimeout;
  if (c.startsWith('NOT_RUNNING')) return s.errNotRunning;
  if (c.startsWith('UNSUPPORTED_OS')) return s.errUnsupportedOs;
  return s.errOther + ': ' + c;
}

module.exports = { getStrings, resolveLang, translateError };

