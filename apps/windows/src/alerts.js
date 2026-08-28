// Canh bao khi sap cham han muc.
// Nguyen tac: KHONG spam. Moi "cua so han muc" (vd 5 gio cua Claude) chi bao 1 lan
// cho MOI MUC do (canh bao -> nguy cap). Chi bao lai khi:
//   - cua so reset (resetAt doi), HOAC
//   - so tut xuong duoi nguong - HYSTERESIS (10 diem) roi leo len lai.
// Neu khong co 2 dieu kien nay thi cu 8s/180s refresh la lai bao => phien toai.

const { Notification } = require('electron');

const HYSTERESIS = 10; // diem % phai tut xuong duoi nguong moi cho bao lai

// key -> { level: 'warn'|'crit', resetAt }
const state = new Map();

function levelOf(pct, warnAt, critAt) {
  if (!Number.isFinite(pct)) return null;
  if (pct >= critAt) return 'crit';
  if (pct >= warnAt) return 'warn';
  return null;
}

// Gom moi han muc cua moi AI thanh 1 danh sach phang de kiem tra.
function flatten(providerList) {
  const out = [];
  for (const p of providerList || []) {
    if (!p || p.error) continue;
    const add = (label, pct, resetAt) => {
      if (pct === null || pct === undefined || !Number.isFinite(Number(pct))) return;
      out.push({
        key: p.providerId + '|' + label,
        providerName: p.providerName,
        label,
        pct: Number(pct),
        resetAt: resetAt || null,
      });
    };
    add('5h', p.fiveHourPct, p.fiveHourResetAt);
    add('weekly', p.weeklyPct, p.weeklyResetAt);
    for (const sc of p.scopedLimits || []) {
      // so cu (stale, vd Antigravity da tat) khong dang de dung day canh bao
      if (sc.stale) continue;
      add(sc.label || 'scoped', sc.pct, sc.resetAt);
    }
  }
  return out;
}

// Ten muc hien trong thong bao — dung chuoi da dich cho 5h/weekly.
function displayLabel(item, s) {
  if (item.label === '5h') return s.fiveHour || '5-Hour';
  if (item.label === 'weekly') return s.weeklyAll || 'Weekly';
  return item.label;
}

function checkAlerts(providerList, config, s) {
  if (config.alertsEnabled === false) return [];
  const warnAt = Number(config.alertWarnPct);
  const critAt = Number(config.alertCritPct);
  const warn = Number.isFinite(warnAt) ? warnAt : 80;
  const crit = Number.isFinite(critAt) ? critAt : 95;

  const fired = [];
  const seen = new Set();

  for (const item of flatten(providerList)) {
    seen.add(item.key);
    const lv = levelOf(item.pct, warn, crit);
    const prev = state.get(item.key);

    // Cua so da reset -> quen trang thai cu
    if (prev && prev.resetAt && item.resetAt && prev.resetAt !== item.resetAt) {
      state.delete(item.key);
    }
    const cur = state.get(item.key);

    if (!lv) {
      // Chi quen han khi da tut du sau (tranh rung quanh nguong)
      if (cur && item.pct < warn - HYSTERESIS) state.delete(item.key);
      continue;
    }
    // Da bao roi va chua len muc cao hon -> im lang
    if (cur && (cur.level === lv || (cur.level === 'crit' && lv === 'warn'))) continue;

    state.set(item.key, { level: lv, resetAt: item.resetAt });
    fired.push({ ...item, level: lv, name: displayLabel(item, s) });
  }

  // AI bien mat khoi danh sach (tat trong Cai dat, dong app) -> don trang thai
  for (const k of Array.from(state.keys())) if (!seen.has(k)) state.delete(k);

  return fired;
}

function notify(fired, s) {
  if (!fired.length) return;
  if (!Notification.isSupported()) return;
  for (const f of fired) {
    const title =
      f.level === 'crit'
        ? (s.alertCritTitle || 'Sắp hết hạn mức!')
        : (s.alertWarnTitle || 'Sắp chạm hạn mức');
    const body = `${f.providerName} · ${f.name}: ${f.pct}%`;
    try {
      new Notification({ title, body, urgency: f.level === 'crit' ? 'critical' : 'normal' }).show();
    } catch {
      // thong bao that bai thi thoi, khong lam sap app
    }
  }
}

function resetState() {
  state.clear();
}

module.exports = { checkAlerts, notify, resetState, _flatten: flatten };
