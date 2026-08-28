// Provider: Codex CLI (OpenAI)
// Doc credential local cua CHINH MAY NGUOI DUNG -> goi API cua OpenAI/ChatGPT (WHAM backend).
// Token khong bao gio roi khoi may.
// ⚠️ CHUA TEST THAT (may nay chua cai Codex CLI luc viet) — dua tren tai lieu cong dong
// (steipete/CodexBar, lenson78/codex-proxy). Kiem tra lai response that khi An cai Codex.

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const ID = 'codex';
const NAME = 'Codex';

function baseDir(overrideDir) {
  return overrideDir || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function credPath(overrideDir) {
  return path.join(baseDir(overrideDir), 'auth.json');
}

// Co dang nhap Codex CLI (ChatGPT OAuth) tren may nay khong?
// Chi tinh la "co" khi dang nhap kieu OAuth (co access_token) — API key rieng (OPENAI_API_KEY)
// khong co endpoint usage theo ke hoach ChatGPT nen khong dung de hien % usage o day.
function detect(overrideDir) {
  try {
    const p = credPath(overrideDir);
    if (!fs.existsSync(p)) return false;
    const auth = JSON.parse(fs.readFileSync(p, 'utf8'));
    const tokens = auth.tokens || {};
    return !!tokens.access_token;
  } catch {
    return false;
  }
}

function readToken(overrideDir) {
  const auth = JSON.parse(fs.readFileSync(credPath(overrideDir), 'utf8'));
  const tokens = auth.tokens || {};
  return { token: tokens.access_token, accountId: tokens.account_id };
}

function pct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}

// reset_at cong dong ghi nhan khong thong nhat (co repo tra so giay unix, co repo tra ISO).
// Xu ly ca 2 dang cho chac.
function toMs(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v > 2e10 ? v : v * 1000; // giay -> ms neu la epoch giay
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

// Nhan cho 1 cua so han muc, suy tu do dai that (giay) chu khong dan cung.
// Sai so 10% de chiu cac gia tri lam tron cua OpenAI.
function windowLabel(sec) {
  if (!sec || sec <= 0) return null;
  const near = (target) => Math.abs(sec - target) <= target * 0.1;
  if (near(18000)) return { slot: 'fiveHour' }; // 5 gio
  if (near(604800)) return { slot: 'weekly' }; // 7 ngay
  const days = Math.round(sec / 86400);
  if (days >= 1) return { slot: 'scoped', label: days + ' ngày' };
  const hours = Math.round(sec / 3600);
  return { slot: 'scoped', label: hours + ' giờ' };
}

// Dat 1 cua so vao dung o cua ket qua (5h / tuan / scoped co nhan rieng).
function placeWindow(out, w) {
  const info = windowLabel(w.limit_window_seconds);
  const p = pct(w.used_percent);
  const at = toMs(w.reset_at);
  if (!info) {
    out.scopedLimits.push({ label: 'Hạn mức', pct: p, resetAt: at });
    return;
  }
  if (info.slot === 'fiveHour' && out.fiveHourPct === null) {
    out.fiveHourPct = p;
    out.fiveHourResetAt = at;
  } else if (info.slot === 'weekly' && out.weeklyPct === null) {
    out.weeklyPct = p;
    out.weeklyResetAt = at;
  } else {
    out.scopedLimits.push({ label: info.label || 'Hạn mức', pct: p, resetAt: at });
  }
}

// Nguon usage: GET /backend-api/wham/usage (backend ChatGPT dung cho Codex CLI).
function fetchUsage(overrideDir) {
  return new Promise((resolve, reject) => {
    let info;
    try {
      info = readToken(overrideDir);
    } catch (e) {
      return reject(new Error('CRED_READ:' + e.message));
    }
    if (!info.token) return reject(new Error('NO_TOKEN'));

    const headers = {
      authorization: 'Bearer ' + info.token,
      'content-type': 'application/json',
    };
    if (info.accountId) headers['chatgpt-account-id'] = info.accountId;

    const req = https.request(
      'https://chatgpt.com/backend-api/wham/usage',
      { method: 'GET', headers, timeout: 20000 },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode === 401 || res.statusCode === 403) return reject(new Error('EXPIRED'));
          if (res.statusCode === 429) return reject(new Error('RATE_LIMITED'));
          if (res.statusCode !== 200) return reject(new Error('HTTP_' + res.statusCode));
          let j;
          try {
            j = JSON.parse(body);
          } catch {
            return reject(new Error('BAD_JSON'));
          }
          const rl = j.rate_limit || {};
          const out = {
            providerId: ID,
            providerName: NAME,
            fiveHourPct: null,
            weeklyPct: null,
            fiveHourResetAt: null,
            weeklyResetAt: null,
            scopedLimits: [],
            plan: j.plan_type || null,
          };
          // KHONG dan cung nhan "5-Hour"/"Weekly" nua. Do THAT 22/07/2026 tren tai khoan
          // plan_type=free: primary_window.limit_window_seconds = 2592000 (30 NGAY), khong
          // phai 5 gio -> widget cu bao "5-Hour Limit 99%" la sai su that. Nay suy nhan tu
          // do dai cua so that; cua so nao khong khop 5h/7 ngay thi day sang scopedLimits
          // voi nhan tinh theo ngay/gio.
          [rl.primary_window, rl.secondary_window].forEach((w) => {
            if (!w || w.used_percent === undefined || w.used_percent === null) return;
            placeWindow(out, w);
          });
          resolve(out);
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', () => reject(new Error('NETWORK')));
    req.end();
  });
}

module.exports = { id: ID, name: NAME, detect, fetchUsage, baseDir };
