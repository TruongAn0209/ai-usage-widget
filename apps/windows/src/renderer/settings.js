let strings = {};

function $(id) {
  return document.getElementById(id);
}
function setText(id, txt) {
  const el = $(id);
  if (el) el.textContent = txt || '';
}

// Hai muc do cai dat nhu ban Mac: mac dinh Gon, tuy chon Du de hien day du tuy chon.
const MODE_KEY = 'settingsMode';
function applyMode(mode) {
  document.body.classList.toggle('settings-full', mode === 'full');
  $('modeCompact').setAttribute('aria-selected', String(mode !== 'full'));
  $('modeFull').setAttribute('aria-selected', String(mode === 'full'));
}
function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
  applyMode(mode);
}
$('modeCompact').addEventListener('click', () => setMode('compact'));
$('modeFull').addEventListener('click', () => setMode('full'));
applyMode(localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'compact');

// Ap nhan theo ngon ngu
function applyStrings(s) {
  strings = s || {};
  document.title = s.settingsTitle || 'Settings';
  setText('h1Title', s.settingsTitle);
  setText('brandSubtitle', s.brandSubtitle);
  setText('modeCompact', s.settingsModeCompact || 'Gá»n');
  setText('modeFull', s.settingsModeFull || 'Äá»§');
  setText('gAppearance', s.groupAppearance);
  setText('gProviders', s.groupProviders);
  setText('gDisplay', s.groupDisplay);
  setText('gAlerts', s.groupAlerts);
  setText('lblAlertsEnabled', s.alertsEnabled);
  setText('lblAlertWarn', s.alertWarnPct);
  setText('lblAlertCrit', s.alertCritPct);
  setText('alertHint', s.alertHint);
  setText('gData', s.groupData);
  setText('gSystem', s.groupSystem);

  setText('lblLanguage', s.language);
  setText('lblLayout', s.layout);
  setText('lblPalette', s.palette);
  setText('lblUseAccent', s.useCustomAccent);
  setText('lblPosition', s.position);
  setText('lblSize', s.size);
  setText('lblOpacity', s.opacity);
  setText('lblAccent', s.accentColor);

  setText('lblShowContext', s.showContextBar);
  setText('lblShowSessions', s.showSessions);
  setText('lblShowToday', s.showTodayDetails);
  setText('lblMaxSessions', s.maxSessions);
  setText('lblContextLimit', s.contextLimit);
  setText('lblSessionActive', s.sessionActive);
  setText('lblShowForecast', s.showForecast);
  setText('forecastHint', s.forecastHint);
  setText('lblAutostart', s.autostart);
  setText('lblHotkey', s.hotkeyToggle);
  setText('hotkeyHint', s.hotkeyHint);
  setText('hotkeyBad', s.hotkeyBad);
  setText('resetBtn', s.resetDefaults);
  setText('liveHint', s.liveHint);

  // Option cua cac select
  const langOpts = $('lang').options;
  langOpts[0].textContent = s.langAuto || 'Auto';
  langOpts[1].textContent = s.langVi || 'Tiếng Việt';
  langOpts[2].textContent = s.langEn || 'English';

  const layoutOpts = $('layout').options;
  layoutOpts[0].textContent = s.layoutCompact || '';
  layoutOpts[1].textContent = s.layoutStandard || '';
  layoutOpts[2].textContent = s.layoutDashboard || '';
  layoutOpts[3].textContent = s.layoutTerminal || '';

  const palOpts = $('palette').options;
  palOpts[0].textContent = s.palDefault || '';
  palOpts[1].textContent = s.palEspresso || '';
  palOpts[2].textContent = s.palLight || '';
  palOpts[3].textContent = s.palCatppuccin || '';
  palOpts[4].textContent = s.palDracula || '';
  palOpts[5].textContent = s.palNord || '';
  palOpts[6].textContent = s.palGruvbox || '';
  palOpts[7].textContent = s.palClaude || '';
  palOpts[8].textContent = s.palCodex || '';
  palOpts[9].textContent = s.palGrok || '';
  palOpts[10].textContent = s.palGemini || '';
  palOpts[11].textContent = s.palAntigravity || '';

  const cornerOpts = $('corner').options;
  cornerOpts[0].textContent = s.cornerTopRight || '';
  cornerOpts[1].textContent = s.cornerTopLeft || '';
  cornerOpts[2].textContent = s.cornerBottomRight || '';
  cornerOpts[3].textContent = s.cornerBottomLeft || '';

  const sizeOpts = $('size').options;
  sizeOpts[0].textContent = s.sizeSmall || '';
  sizeOpts[1].textContent = s.sizeMedium || '';
  sizeOpts[2].textContent = s.sizeLarge || '';
}

function fillForm(config, autostart) {
  $('lang').value = config.lang || 'auto';
  $('layout').value = ['compact', 'standard', 'dashboard', 'terminal'].includes(config.layout) ? config.layout : 'standard';
  $('palette').value = config.palette || 'default';
  $('corner').value = config.corner || 'top-right';
  $('size').value = config.size || 'small';
  $('opacity').value = config.opacity ?? 0.92;
  $('opacityVal').textContent = Math.round((config.opacity ?? 0.92) * 100) + '%';

  const custom = config.accentColor && config.accentColor !== 'auto';
  $('useAccent').checked = !!custom;
  $('accentColor').value = custom ? config.accentColor : '#21e0ff';
  $('accentColor').disabled = !custom;


  $('showContextBar').checked = config.showContextBar !== false;
  $('showSessions').checked = config.showSessions !== false;
  $('showTodayDetails').checked = config.showTodayDetails !== false;
  $('maxSessions').value = config.maxSessions || 5;

  $('alertsEnabled').checked = config.alertsEnabled !== false;
  $('alertWarnPct').value = config.alertWarnPct == null ? 80 : config.alertWarnPct;
  $('alertCritPct').value = config.alertCritPct == null ? 95 : config.alertCritPct;

  $('contextLimit').value = config.contextLimitTokens || 1000000;
  $('sessionActive').value = config.sessionActiveMinutes || 30;

  $('showForecast').checked = config.showForecast !== false;

  $('autostart').checked = !!autostart;
  $('hotkeyToggle').value = config.hotkeyToggle == null ? 'Control+Alt+U' : config.hotkeyToggle;
}

// Phim tat dang ky that bai (sai cu phap / app khac chiem) -> noi ro cho nguoi dung,
// khong de ho bam hoai ma khong hieu sao khong an.
function showHotkeyStatus(ok) {
  const el = $('hotkeyBad');
  if (el) el.style.display = ok === false ? '' : 'none';
}

$('opacity').addEventListener('input', () => {
  $('opacityVal').textContent = Math.round($('opacity').value * 100) + '%';
});

// Báº­t/táº¯t Ã´ chá»n mÃ u theo checkbox
$('useAccent').addEventListener('change', () => {
  $('accentColor').disabled = !$('useAccent').checked;
});

// AI nÃ o Ä‘ang bá»‹ Bá»Ž chá»n (checkbox táº¯t) -> Ä‘Æ°a vÃ o disabledProviders
function collectDisabledProviders() {
  return Array.from(document.querySelectorAll('#providerChecks input[type=checkbox]'))
    .filter((el) => !el.checked)
    .map((el) => el.dataset.providerId);
}

function clampPct(v, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(1, n));
}

function collect() {
  return {
    config: {
      lang: $('lang').value,
      layout: $('layout').value,
      palette: $('palette').value,
      corner: $('corner').value,
      size: $('size').value,
      opacity: parseFloat($('opacity').value),
      accentColor: $('useAccent').checked ? $('accentColor').value : 'auto',
      showContextBar: $('showContextBar').checked,
      showSessions: $('showSessions').checked,
      showTodayDetails: $('showTodayDetails').checked,
      maxSessions: parseInt($('maxSessions').value, 10) || 5,
      showForecast: $('showForecast').checked,
      hotkeyToggle: $('hotkeyToggle').value.trim(),
      alertsEnabled: $('alertsEnabled').checked,
      alertWarnPct: clampPct($('alertWarnPct').value, 80),
      // nguong nguy cap khong duoc thap hon nguong canh bao, khong thi bao lon xon
      alertCritPct: Math.max(clampPct($('alertCritPct').value, 95), clampPct($('alertWarnPct').value, 80)),
      contextLimitTokens: parseInt($('contextLimit').value, 10) || 1000000,
      sessionActiveMinutes: parseInt($('sessionActive').value, 10) || 30,
      disabledProviders: collectDisabledProviders(),
    },
    autostart: $('autostart').checked,
  };
}

// Dá»±ng láº¡i danh sÃ¡ch checkbox AI theo providerCatalog (Ä‘áº¿n tá»« main, cÃ³ the doi khi them AI moi)
function renderProviderChecks(catalog, disabledProviders) {
  const wrap = $('providerChecks');
  const disabled = new Set(disabledProviders || []);
  wrap.innerHTML = '';
  (catalog || []).forEach((p) => {
    const label = document.createElement('label');
    label.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.providerId = p.id;
    input.checked = !disabled.has(p.id);
    input.addEventListener('change', applyNow);
    const span = document.createElement('span');
    span.textContent = p.name;
    label.appendChild(input);
    label.appendChild(span);
    wrap.appendChild(label);
  });
}

// ---- Ãp dá»¥ng trá»±c tiáº¿p: chá»‰nh tá»›i Ä‘Ã¢u widget Ä‘á»•i tá»›i Ä‘Ã³ ----
let applyTimer = null;
let suppress = false; // cháº·n lÃºc Ä‘ang Ä‘á»• dá»¯ liá»‡u vÃ o form

function flash() {
  const msg = $('savedMsg');
  msg.textContent = strings.applied || 'Applied';
  msg.classList.add('show');
  clearTimeout(flash._t);
  flash._t = setTimeout(() => msg.classList.remove('show'), 1200);
}

function applyNow() {
  if (suppress) return;
  window.claudeUsage.saveSettings(collect());
  flash();
}

// Gá»™p nhiá»u láº§n gá»i liÃªn tiáº¿p (kÃ©o slider, chá»n mÃ u) thÃ nh má»™t
function applySoon(delay) {
  if (suppress) return;
  clearTimeout(applyTimer);
  applyTimer = setTimeout(applyNow, delay);
}

const INSTANT = ['lang', 'layout', 'palette', 'corner', 'size',
  'showContextBar', 'showSessions', 'showTodayDetails', 'useAccent', 'autostart', 'alertsEnabled', 'showForecast'];
const TYPED = ['maxSessions', 'contextLimit', 'sessionActive', 'alertWarnPct', 'alertCritPct', 'hotkeyToggle'];
const DRAGGED = ['opacity', 'accentColor'];

INSTANT.forEach((id) => $(id).addEventListener('change', applyNow));
TYPED.forEach((id) => $(id).addEventListener('input', () => applySoon(500)));
DRAGGED.forEach((id) => $(id).addEventListener('input', () => applySoon(120)));

$('resetBtn').addEventListener('click', () => {
  window.claudeUsage.resetSettings();
});

window.claudeUsage.onSettingsData((data) => {
  suppress = true;
  applyStrings(data.strings);
  fillForm(data.config, data.autostart);
  renderProviderChecks(data.providerCatalog, data.config.disabledProviders);
  showHotkeyStatus(data.hotkeyOk);
  suppress = false;
});


