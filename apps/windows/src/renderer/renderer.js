// ---------- Tiện ích ----------
function fmtCountdown(targetMs) {
  const diff = targetMs - Date.now();
  if (diff <= 0) return 'now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// Gio dong ho theo may (Date dung timezone he thong -> tu dong la gio dia phuong Windows).
function fmtClock(targetMs) {
  const d = new Date(targetMs);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// "Khôi phục lúc 18:30 · còn 2h 15m" — vua co moc gio ro rang vua co dem nguoc.
function fmtResetInfo(targetMs, s) {
  if (!targetMs) return '--';
  return `${s.resetAt || 'Resets at'} ${fmtClock(targetMs)} · ${s.resetIn || 'in'} ${fmtCountdown(targetMs)}`;
}

function fmtTokens(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function fmtTime(ts, s) {
  if (!ts) return '--';
  const d = new Date(ts);
  const label = (s && s.updatedAt) || 'Updated';
  const p = (x) => String(x).padStart(2, '0');
  return `${label} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function levelClass(pct) {
  if (pct === null || pct === undefined) return '';
  if (pct >= 90) return 'crit';
  if (pct >= 70) return 'warn';
  return '';
}

function shortModel(name) {
  return (name || 'unknown').replace('claude-', '');
}

function esc(str) {
  return String(str == null ? '' : str).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// Gom han muc cua 1 provider (dung lai cho ca truong hop nhieu AI).
// tag = ten AI (vd "Codex") — chi dung de gom nhom + hien tieu de phia tren, KHONG nhet
// vao label/short cua tung muc nua (truoc day lam vay ra chu tat "5HCla"/"Promp" kho hieu).
// Du bao luc het quota (main gui trong latest.forecasts, key = providerId|ten-muc).
// Chi co key nao main do duoc TOC DO THAT moi co; khong co thi khong hien gi.
function forecastNote(providerId, bucketName, s) {
  const f = latest && latest.forecasts && latest.forecasts[providerId + '|' + bucketName];
  if (!f || !f.etaMs) return '';
  const d = new Date(f.etaMs);
  const p = (x) => String(x).padStart(2, '0');
  return ` · ${s.forecastEta || 'runs out ~'}${p(d.getHours())}:${p(d.getMinutes())}`;
}

function collectProviderMetrics(p, s, tag) {
  const list = [];
  if (p.fiveHourPct !== null && p.fiveHourPct !== undefined) {
    list.push({
      key: '5h-' + (tag || 'main'),
      group: tag,
      label: s.fiveHour || '5-Hour',
      pct: p.fiveHourPct,
      info: fmtResetInfo(p.fiveHourResetAt, s) + forecastNote(p.providerId, '5h', s),
    });
  }
  if (p.weeklyPct !== null && p.weeklyPct !== undefined) {
    list.push({
      key: 'week-' + (tag || 'main'),
      group: tag,
      label: s.weeklyAll || 'Weekly',
      pct: p.weeklyPct,
      info: fmtResetInfo(p.weeklyResetAt, s) + forecastNote(p.providerId, 'weekly', s),
    });
  }
  (p.scopedLimits || []).forEach((sc) => {
    list.push({
      key: 'scoped-' + (tag || 'main') + '-' + sc.label,
      group: tag,
      label: sc.label,
      pct: sc.pct,
      // sc.info = chu thich rieng cua provider (vd so credit con lai). Uu tien no vi no noi
      // ro nghia hon dong dem nguoc; khong co thi moi dung ngay reset.
      info: (sc.info || fmtResetInfo(sc.resetAt, s)) + forecastNote(p.providerId, sc.label || 'scoped', s),
      colorVar: 'var(--scoped)',
      cls: 'scoped',
      fixedColor: true,
    });
  });
  return list;
}

// Gom cac han muc thanh tung nhom lien tiep theo group (ten AI). Chi tra nhieu nhom khi
// that su co >1 AI dang hien (group khac null) — tranh chen header thua khi chi 1 AI.
function groupMetrics(metrics) {
  const groups = [];
  let current = null;
  for (const m of metrics) {
    const key = m.group || null;
    if (!current || current.key !== key) {
      current = { key, items: [] };
      groups.push(current);
    }
    current.items.push(m);
  }
  return groups;
}

// Dung lai cho moi bo cuc dang-flat (bars/rings/strip/terminal, va cot trai cua dashboard):
// neu co >=2 nhom co ten AI thi chen tieu de phan tach, khong thi giu nguyen nhu cu.
function renderWithGroups(metrics, buildFn) {
  const groups = groupMetrics(metrics);
  const namedGroupCount = groups.filter((g) => g.key).length;
  if (namedGroupCount <= 1) return buildFn(metrics);
  return groups.map((g) => (g.key ? `<div class="provider-group-header">${esc(g.key)}</div>` : '') + buildFn(g.items)).join('');
}

// Gom cac han muc thanh 1 danh sach thong nhat cho moi bo cuc dung chung.
// Co >1 AI tren may -> ghep han muc cua tung AI lien tiep, co nhan ten AI phan biet.
function collectMetrics(d, s) {
  const list = [];
  if (cfg.showContextBar !== false && d.currentContext) {
    list.push({
      key: 'ctx',
      label: s.contextWindow || 'Context',
      pct: d.currentContext.contextPct,
      info: `${fmtTokens(d.currentContext.contextTokens)} / ${fmtTokens(d.contextLimit)} · ${s.contextLimitConfigured || 'giới hạn cấu hình'}`,
      contextTokens: d.currentContext.contextTokens,
      contextLimit: d.contextLimit,
      colorVar: 'var(--ctx)',
      cls: 'ctx',
      fixedColor: true,
    });
  }

  const providerList = Array.isArray(d.providers) && d.providers.length ? d.providers : null;
  if (providerList) {
    const multi = providerList.length > 1;
    providerList.forEach((p) => {
      if (p.error) return; // loi da hien o dong trang thai, khong chiem cho o day
      list.push(...collectProviderMetrics(p, s, multi ? p.providerName : null));
    });
  } else {
    // Tuong thich nguoc: chua co d.providers (vd du lieu cu) -> dung field cu o goc d.
    list.push(...collectProviderMetrics(d, s, null));
  }
  return list;
}

// Muc canh bao LUON thang mau rieng cua tung muc. Truoc day muc co fixedColor (context va
// scopedLimits cua Antigravity) bo qua han levelClass -> Antigravity 99% van mau vang binh
// thuong trong khi Codex 99% do rue, nhin nghich nhau. Nay: duoi nguong canh bao thi giu mau
// rieng (xanh cho context, vang cho scoped), tu 70% tro len thi warn/crit nhu moi muc khac.
function metricColor(m) {
  if (!hasPct(m)) return 'var(--scoped)'; // muc khong co so: mau trung tinh, khong doa ai
  const lv = levelClass(m.pct);
  if (lv === 'crit') return 'var(--crit)';
  if (lv === 'warn') return 'var(--warn)';
  return m.fixedColor ? m.colorVar : 'var(--ok)';
}

// Co provider DETECT DUOC nhung hang KHONG phat ra so hạn mức (Grok: xAI khong co truong
// phan tram trong API billing — da do lai ca tren tai khoan tra phi). Truoc day muc do bi
// bo qua hoan toan nen Grok bien mat khoi widget, nhin y nhu chua dang nhap.
// Nay: pct = null -> ve thanh/vong RONG + chu "—". Khong bao gio thay null bang 0, vi 0
// nghia la "chua dung gi" — do la bia so.
function hasPct(m) {
  return m && m.pct !== null && m.pct !== undefined && Number.isFinite(Number(m.pct));
}
function pctText(m) {
  return hasPct(m) ? m.pct + '%' : '—';
}
function pctWidth(m) {
  return hasPct(m) ? Math.min(100, m.pct) : 0;
}

// ---------- Bố cục 1: Thanh ngang ----------
function layoutBars(metrics) {
  return metrics
    .map((m) => {
      const lv = levelClass(m.pct); // ap dung cho MOI muc, ke ca context/scoped (xem metricColor)
      const fillCls = 'bar-fill' + (m.cls ? ' ' + m.cls : '') + (lv ? ' ' + lv : '');
      const pctCls =
        'pct' + (m.cls === 'ctx' ? ' small-pct' : '') + (m.cls === 'scoped' ? ' scoped-pct' : '') + (lv ? ' ' + lv : '');
      return (
        `<div class="row"><div class="row-header">` +
        `<span class="label" title="${esc(m.label)}">${esc(m.label)}</span><span class="reset">${esc(m.info)}</span></div>` +
        `<div class="bar-track"><div class="${fillCls}" style="width:${pctWidth(m)}%"></div></div>` +
        `<span class="${pctCls}">${pctText(m)}</span></div>`
      );
    })
    .join('');
}

function layoutCompact(metrics) {
  const selected = metrics.filter((m) => m.cls === 'ctx' || m.key.indexOf('5h-') === 0).slice(0, 2);
  return `<div class="compact-status">${layoutBars(selected)}</div>`;
}

// ---------- Bố cục 4: Bảng lớn ----------
function layoutDashboard(metrics, d, s) {
  const context = metrics.find((m) => m.cls === 'ctx');
  const contextCard = context
    ? `<div class="context-card" title="${esc(s.contextLimitConfigured || 'giới hạn cấu hình')}"><div class="section-title">${esc(s.contextWindow || 'Context')}</div>` +
      `<div class="context-primary">${fmtTokens(context.contextTokens)} / ${fmtTokens(context.contextLimit)}</div>` +
      `<div class="context-secondary">${hasPct(context) ? context.pct + '%' : '—'} · ${esc(s.contextLimitConfigured || 'giới hạn cấu hình')} · ${fmtTokens(Math.max(0, context.contextLimit - context.contextTokens))} ${esc(s.contextRemaining || 'còn lại')}</div></div>`
    : '';
  const left = contextCard + renderWithGroups(metrics.filter((m) => m.cls !== 'ctx'), layoutBars);
  const stat = (k, v) => `<div class="stat-line"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  const models = (d.modelBreakdown || [])
    .map((m) => `<div class="model-row"><span>${esc(shortModel(m.model))}</span><span>${fmtTokens(m.tokens)}</span></div>`)
    .join('');
  const right = cfg.showTodayDetails === false ? '' :
    `<div class="section-title">${esc(s.todayTitle || '')}</div>` +
    stat(s.todayTokens || '', fmtTokens(d.todayTokens)) +
    stat(s.todayCost || '', '$' + (d.todayCost || 0).toFixed(2)) +
    stat(s.todayMsgs || '', `${d.todayMessages || 0} / ${d.todaySessions || 0}`) +
    stat(s.burnRate || '', fmtTokens(d.burnRatePerMin) + ' ' + (s.perMin || '')) +
    `<div class="model-list">${models}</div>`;
  return `<div class="dash"><div class="dash-col">${left}</div>${right ? `<div class="dash-col">${right}</div>` : ''}</div>`;
}

// ---------- Bố cục: Terminal ----------
// CHI dung cho phan dong lenh; dong nhac "$ ai --usage" do LAYOUTS.terminal them
// DUY NHAT 1 LAN o ngoai — truoc day layoutTerminal tu chen nen moi nhom AI lai
// lap lai dong nhac (An chup man hinh 23/07: 5 dong "$ ai --usage").
function layoutTerminalLines(metrics) {
  const W = 10;
  return metrics
    .map((m) => {
      const color = metricColor(m);
      const filled = Math.round((pctWidth(m) / 100) * W);
      const bar = '█'.repeat(filled) + '░'.repeat(W - filled);
      return (
        `<div class="term-line"><span class="term-key" title="${esc(m.label)}">${esc(m.label)}</span>` +
        `<span class="term-bar" style="color:${color}">[${bar}]</span>` +
        `<span class="term-pct" style="color:${color}">${pctText(m)}</span></div>`
      );
    })
    .join('');
}

const LAYOUTS = {
  compact: (m) => layoutCompact(m),
  standard: (m) => renderWithGroups(m, layoutBars),
  dashboard: (m, d, s) => layoutDashboard(m, d, s), // tu no da goi renderWithGroups cho cot trai
  terminal: (m) =>
    `<div class="term"><div class="term-prompt">$ ai --usage</div>${renderWithGroups(m, layoutTerminalLines)}</div>`,
};

// ---------- Vẽ ----------
let latest = null;
let expanded = false;
let cfg = {};

function render() {
  if (!latest) return;
  const s = latest.strings || {};
  const layout = cfg.layout || 'standard';

  const emptyEl = document.getElementById('emptyState');
  const mainEl = document.getElementById('mainContent');
  const hintEl = document.getElementById('expandHint');
  const panelEl = document.getElementById('expandedPanel');

  // Chưa tìm thấy AI nào
  if (latest.noAiFound) {
    emptyEl.style.display = '';
    mainEl.style.display = 'none';
    hintEl.style.display = 'none';
    panelEl.style.display = 'none';
    document.getElementById('emptyTitle').textContent = s.noAiTitle || 'No AI found';
    document.getElementById('emptyBody').textContent = s.noAiBody || '';
    document.getElementById('emptyHint').textContent = s.noAiHint || '';
    document.getElementById('emptyRefresh').textContent = s.refresh || 'Refresh';
    document.getElementById('planLine').textContent = '';
    reportHeight();
    return;
  }
  emptyEl.style.display = 'none';
  mainEl.style.display = '';

  const allowExpand = layout !== 'compact';
  hintEl.style.display = allowExpand ? '' : 'none';
  panelEl.style.display = allowExpand ? '' : 'none';

  // Dựng phần chính theo bố cục
  const metrics = collectMetrics(latest, s);
  const build = LAYOUTS[layout] || LAYOUTS.standard;
  mainEl.innerHTML = build(metrics, latest, s);

  hintEl.textContent = expanded ? s.expandLess || '▴' : s.expandMore || '▾';

  // Dòng trạng thái — co nhieu AI thi liet ke tung cai, uu tien hien loi neu co.
  // fetchError = lan refresh gan nhat hong (mang/exception bat ngo) NHUNG usage cu van
  // con nguyen (main.js khong xoa lastProviders nua) -> chi bao "du lieu cu", khong an so.
  const plan = document.getElementById('planLine');
  const providerList = Array.isArray(latest.providers) ? latest.providers : [];
  const anyError = providerList.some((p) => p.error);
  const staleSuffix = latest.fetchError ? ` · ⚠ ${s.staleData || 'dữ liệu cũ'}` : '';
  if (providerList.length > 1) {
    const parts = providerList.map((p) =>
      p.error ? `⚠ ${p.providerName}` : `${p.providerName}${p.plan ? ' · ' + p.plan.toUpperCase() : ''}`
    );
    plan.textContent = parts.join('   ') + staleSuffix;
    plan.style.color = anyError || latest.fetchError ? 'var(--warn)' : '';
  } else if (latest.error) {
    plan.textContent = '⚠ ' + latest.error + staleSuffix;
    plan.style.color = 'var(--warn)';
  } else {
    const sub = latest.plan ? latest.plan.toUpperCase() : '';
    plan.textContent = (s.realFromApi || '') + (sub ? ' · ' + sub : '') + staleSuffix;
    plan.style.color = latest.fetchError ? 'var(--warn)' : '';
  }

  // Panel mở rộng; dashboard dựng thống kê hôm nay ngay trong cột phải.
  const todaySection = document.getElementById('todaySection');
  if (todaySection) {
    const hideToday = cfg.showTodayDetails === false || layout === 'dashboard';
    todaySection.style.display = hideToday ? 'none' : '';
  }

  document.getElementById('sessionsTitle').textContent = s.sessionsTitle || '';
  document.getElementById('todayTitle').textContent = s.todayTitle || '';
  document.getElementById('lblTodayTokens').textContent = s.todayTokens || '';
  document.getElementById('lblTodayCost').textContent = s.todayCost || '';
  document.getElementById('lblTodayMsgs').textContent = s.todayMsgs || '';
  document.getElementById('lblBurnRate').textContent = s.burnRate || '';

  const sList = document.getElementById('sessionList');
  sList.innerHTML = '';
  const maxS = cfg.maxSessions || 5;
  (latest.sessions || []).slice(0, maxS).forEach((ss, i) => {
    const row = document.createElement('div');
    row.className = 'session-row' + (i === 0 ? ' active' : '');
    const age = ss.ageMinutes <= 0 ? 'now' : ss.ageMinutes + 'm';
    row.innerHTML =
      `<span class="sess-proj">${esc(ss.project)}</span>` +
      `<span class="sess-model">${esc(shortModel(ss.model))} · ${age}</span>` +
      `<span class="sess-ctx">${ss.contextPct}%</span>`;
    sList.appendChild(row);
  });
  if (!(latest.sessions || []).length) {
    sList.innerHTML = `<div class="session-row"><span class="sess-proj">${esc(s.noActiveSession || '')}</span></div>`;
  }

  document.getElementById('todayTokens').textContent = fmtTokens(latest.todayTokens);
  document.getElementById('todayCost').textContent = '$' + (latest.todayCost || 0).toFixed(2);
  document.getElementById('todayMsgs').textContent = `${latest.todayMessages || 0} / ${latest.todaySessions || 0}`;
  document.getElementById('burnRate').textContent =
    fmtTokens(latest.burnRatePerMin) + ' ' + (s.perMin || 'tok/min');

  const list = document.getElementById('modelList');
  list.innerHTML = '';
  (latest.modelBreakdown || []).forEach((m) => {
    const row = document.createElement('div');
    row.className = 'model-row';
    row.innerHTML = `<span>${esc(shortModel(m.model))}</span><span>${fmtTokens(m.tokens)}</span>`;
    list.appendChild(row);
  });

  document.getElementById('lastUpdate').textContent = fmtTime(latest.updatedAt, s);
  document.getElementById('mainLastUpdate').textContent = fmtTime(latest.updatedAt, s);
  reportHeight();
}

function reportHeight() {
  const card = document.getElementById('card');
  if (!card) return;
  const h = Math.ceil(card.getBoundingClientRect().height) + 4;
  window.claudeUsage.reportHeight(h);
}

// ---------- Cấu hình ----------
function applyConfig(c) {
  cfg = c || {};
  document.body.dataset.palette = cfg.palette || 'default';
  document.body.dataset.layout = cfg.layout || 'standard';

  // Màu nhấn riêng: chỉ ghi đè khi người dùng chọn (khác 'auto')
  if (cfg.accentColor && cfg.accentColor !== 'auto') {
    document.documentElement.style.setProperty('--accent', cfg.accentColor);
  } else {
    document.documentElement.style.removeProperty('--accent');
  }

  const sessSection = document.getElementById('sessionSection');
  if (sessSection) sessSection.style.display = cfg.showSessions === false ? 'none' : '';

  if (latest) render();
}

window.claudeUsage.onConfig(applyConfig);

window.claudeUsage.onUpdate((data) => {
  latest = data;
  render();
});

window.claudeUsage.onError((msg) => {
  document.getElementById('planLine').textContent = 'Error: ' + msg;
});

setInterval(render, 30000);

document.getElementById('closeBtn').addEventListener('click', () => window.claudeUsage.close());
document.getElementById('settingsBtn').addEventListener('click', () => window.claudeUsage.openSettings());
document.getElementById('emptyRefresh').addEventListener('click', () => window.claudeUsage.refreshNow());

document.getElementById('expandHint').addEventListener('click', () => {
  expanded = !expanded;
  const s = (latest && latest.strings) || {};
  document.getElementById('expandedPanel').classList.toggle('open', expanded);
  document.getElementById('expandHint').textContent = expanded ? s.expandLess || '▴' : s.expandMore || '▾';
  window.claudeUsage.toggleExpand(expanded);
  requestAnimationFrame(reportHeight);
});
