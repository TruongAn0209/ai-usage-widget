// Kiem kieu + gioi han cau hinh TRUOC khi ghi dia hoac ap cho cua so — tach rieng khoi main.js
// (giong apps/macos/src/configSchema.js) de test duoc bang Node thuan, khong dung Electron.
const SETTINGS_ENUMS = {
  lang: ['auto', 'vi', 'en'],
  layout: ['compact', 'standard', 'dashboard', 'terminal'],
  palette: ['default', 'espresso', 'light', 'catppuccin', 'dracula', 'nord', 'gruvbox',
    'claude', 'codex', 'grok', 'gemini', 'antigravity'],
  corner: ['top-right', 'top-left', 'bottom-right', 'bottom-left'],
  size: ['small', 'medium', 'large'],
};
const SETTINGS_BOOLEANS = ['showContextBar', 'showSessions', 'showTodayDetails',
  'showForecast', 'alertsEnabled'];

// `knownProviderIds`: mang id provider hop le hien tai (main.js truyen providers.ALL.map(p=>p.id))
// — tach tham so nay ra de test khong phai require ca module providers/index.js.
function sanitizeSettingsPatch(raw, knownProviderIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, values] of Object.entries(SETTINGS_ENUMS)) {
    if (values.includes(raw[key])) out[key] = raw[key];
  }
  for (const key of SETTINGS_BOOLEANS) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  const number = (key, min, max) => {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) out[key] = Math.max(min, Math.min(max, value));
  };
  number('opacity', 0.15, 1);
  number('maxSessions', 1, 20);
  number('contextLimitTokens', 1000, 2000000);
  number('sessionActiveMinutes', 1, 240);
  number('alertWarnPct', 1, 99);
  number('alertCritPct', 2, 100);
  if (raw.accentColor === 'auto' || /^#[0-9a-f]{6}$/i.test(raw.accentColor || '')) {
    out.accentColor = raw.accentColor;
  }
  if (typeof raw.hotkeyToggle === 'string' && raw.hotkeyToggle.length <= 100) {
    out.hotkeyToggle = raw.hotkeyToggle;
  }
  if (Array.isArray(raw.disabledProviders)) {
    const known = new Set(knownProviderIds || []);
    out.disabledProviders = [...new Set(raw.disabledProviders.filter((id) => known.has(id)))];
  }
  if (out.alertWarnPct != null && out.alertCritPct != null && out.alertWarnPct >= out.alertCritPct) {
    out.alertWarnPct = Math.max(1, out.alertCritPct - 1);
  }
  return out;
}

module.exports = { sanitizeSettingsPatch, SETTINGS_ENUMS, SETTINGS_BOOLEANS };
