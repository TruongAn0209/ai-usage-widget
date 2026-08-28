// Provider: Gemini CLI (Google)
//
// ⚠️ CHUA XAC MINH TREN MAY THAT (23/07/2026): may cua An CHUA CAI Gemini CLI
// (`~/.gemini` chi chua file cua Antigravity: antigravity-cli/antigravity-ide/config,
// khong co oauth_creds.json). Code nay viet theo tai lieu cong dong steipete/CodexBar
// (docs/gemini.md) + tai lieu chinh chu gemini-cli. KHI NAO An cai Gemini CLI that:
// viec dau tien la chay `node -e` goi thang provider nay xem field co dung khong,
// SAI THI SUA THEO RESPONSE THAT — dung tin README suong (bai hoc Antigravity, Dot 5).
//
// Duong di:
//   1. Doc ~/.gemini/oauth_creds.json  {access_token, refresh_token, expiry_date, id_token}
//   2. Het han -> POST https://oauth2.googleapis.com/token (form-encoded, grant_type=refresh_token)
//   3. POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota
//      body {"project": "<projectId>"} (hoac {} neu khong biet project)
//      -> moi model co {modelId, remainingFraction (0..1 CON LAI), resetTime}
//
// remainingFraction la CON LAI -> phai doi thanh % DA DUNG theo quy uoc chung cua widget
// (An chot 22/07: moi muc deu la "% da dung", tang dan).

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const ID = 'gemini';
const NAME = 'Gemini CLI';

// Client OAuth cong khai cua gemini-cli (nam trong ma nguon mo cua chinh no).
// Uu tien lay tu ban cai tren may neu tim thay, khong thi dung hang so nay.
const FALLBACK_CLIENT_ID =
  '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
const FALLBACK_CLIENT_SECRET = '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';

const REFRESH_SKEW_MS = 5 * 60 * 1000;

function baseDir(overrideDir) {
  return overrideDir || process.env.GEMINI_CONFIG_DIR || path.join(os.homedir(), '.gemini');
}
function credPath(overrideDir) {
  return path.join(baseDir(overrideDir), 'oauth_creds.json');
}

function readCreds(overrideDir) {
  return JSON.parse(fs.readFileSync(credPath(overrideDir), 'utf8'));
}

// Co Gemini CLI da dang nhap tren may nay khong?
// LUU Y: thu muc ~/.gemini CO THE ton tai do Antigravity tao ma khong he co Gemini CLI —
// nen phai kiem dung file oauth_creds.json + co access_token, khong kiem thu muc.
function detect(overrideDir) {
  try {
    const p = credPath(overrideDir);
    if (!fs.existsSync(p)) return false;
    const c = readCreds(overrideDir);
    return !!(c && c.access_token);
  } catch {
    return false;
  }
}

// Project ID (neu co) — Gemini CLI luu trong settings.json hoac bien moi truong.
function readProjectId(overrideDir) {
  const envId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (envId) return envId;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(baseDir(overrideDir), 'settings.json'), 'utf8'));
    return s.projectId || s.project || (s.security && s.security.projectId) || null;
  } catch {
    return null;
  }
}

// Client id/secret: co gang moc tu ban gemini-cli cai tren may (npm global) truoc.
let cachedClient = null;
function oauthClient() {
  if (cachedClient) return cachedClient;
  cachedClient = { id: FALLBACK_CLIENT_ID, secret: FALLBACK_CLIENT_SECRET };
  const candidates = [
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@google', 'gemini-cli', 'dist'),
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@google', 'gemini-cli-core', 'dist'),
    '/usr/local/lib/node_modules/@google/gemini-cli/dist',
    '/opt/homebrew/lib/node_modules/@google/gemini-cli/dist',
  ];
  for (const dir of candidates) {
    try {
      if (!dir || !fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.js')) continue;
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        const id = txt.match(/([0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com)/);
        const secret = txt.match(/(GOCSPX-[A-Za-z0-9_-]+)/);
        if (id && secret) {
          cachedClient = { id: id[1], secret: secret[1] };
          return cachedClient;
        }
      }
    } catch {
      // thu ung vien tiep theo
    }
  }
  return cachedClient;
}

function request(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const opts = { method, headers: { ...headers }, timeout: 20000 };
    if (body != null) opts.headers['content-length'] = Buffer.byteLength(body);
    const req = https.request(url, opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', () => reject(new Error('NETWORK')));
    if (body != null) req.write(body);
    req.end();
  });
}

function persist(overrideDir, patch) {
  try {
    const p = credPath(overrideDir);
    const c = readCreds(overrideDir);
    const next = { ...c, ...patch };
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, p);
  } catch {
    // khong ghi duoc thi van dung token trong bo nho
  }
}

let refreshInFlight = null;
function refreshAccessToken(overrideDir) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const c = readCreds(overrideDir);
    if (!c.refresh_token) throw new Error('EXPIRED');
    const client = oauthClient();
    const form = new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      refresh_token: c.refresh_token,
      grant_type: 'refresh_token',
    }).toString();
    const res = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (res.status !== 200) throw new Error('EXPIRED');
    let j;
    try {
      j = JSON.parse(res.body);
    } catch {
      throw new Error('EXPIRED');
    }
    if (!j.access_token) throw new Error('EXPIRED');
    const patch = {
      access_token: j.access_token,
      expiry_date: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    };
    if (j.refresh_token) patch.refresh_token = j.refresh_token; // co the xoay vong
    if (j.id_token) patch.id_token = j.id_token;
    persist(overrideDir, patch);
    return patch.access_token;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function pct1(n) {
  return Math.round(n * 10) / 10;
}
function toMs(v) {
  if (!v) return null;
  const t = typeof v === 'number' ? v : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

// Nhieu model dung CHUNG 1 quota -> gom lai 1 muc (giong cach lam cho Antigravity),
// khong thi bang bi lap 10 dong y het nhau.
function groupQuotas(list) {
  const groups = new Map();
  for (const q of list) {
    const frac = Number(q.remainingFraction);
    if (!Number.isFinite(frac)) continue;
    const reset = toMs(q.resetTime);
    const key = frac.toFixed(4) + '|' + (reset || 0);
    if (!groups.has(key)) groups.set(key, { frac, reset, names: [] });
    groups.get(key).names.push(shortModel(q.modelId || q.model || q.label || ''));
  }
  return Array.from(groups.values()).map((g) => ({
    label: g.names.filter(Boolean).slice(0, 3).join(' & ') || 'Gemini',
    pct: pct1((1 - g.frac) * 100), // CON LAI -> DA DUNG
    resetAt: g.reset,
  }));
}

function shortModel(id) {
  return String(id)
    .replace(/^models\//, '')
    .replace(/-latest$/, '')
    .replace(/^gemini-/i, 'Gemini ');
}

// Tim mang quota trong response — ten field co the khac giua cac ban, nen do rong
// thay vi cam mot duong dan cung roi im lang tra ve rong.
function findQuotaArray(j) {
  const keys = ['modelQuotas', 'quotas', 'userQuotas', 'quotaInfos', 'modelQuotaInfos'];
  for (const k of keys) if (Array.isArray(j[k])) return j[k];
  for (const v of Object.values(j)) {
    if (Array.isArray(v) && v.some((x) => x && x.remainingFraction !== undefined)) return v;
    if (v && typeof v === 'object') {
      const nested = findQuotaArray(v);
      if (nested.length) return nested;
    }
  }
  return [];
}

async function fetchUsage(overrideDir) {
  let creds;
  try {
    creds = readCreds(overrideDir);
  } catch (e) {
    throw new Error('CRED_READ:' + e.message);
  }
  let token = creds.access_token;
  if (!token) throw new Error('NO_TOKEN');
  if (creds.expiry_date && Date.now() > Number(creds.expiry_date) - REFRESH_SKEW_MS) {
    token = await refreshAccessToken(overrideDir);
  }

  const call = async (tok) => {
    const project = readProjectId(overrideDir);
    return request('https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
      body: JSON.stringify(project ? { project } : {}),
    });
  };

  let res = await call(token);
  if (res.status === 401 || res.status === 403) {
    token = await refreshAccessToken(overrideDir);
    res = await call(token);
  }
  if (res.status === 401 || res.status === 403) throw new Error('EXPIRED');
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (res.status !== 200) throw new Error('HTTP_' + res.status);

  let j;
  try {
    j = JSON.parse(res.body);
  } catch {
    throw new Error('BAD_JSON');
  }

  const scoped = groupQuotas(findQuotaArray(j));
  return {
    providerId: ID,
    providerName: NAME,
    // Gemini CLI khong tach 2 khai niem 5h/tuan nhu Claude -> de trong, dung scopedLimits.
    fiveHourPct: null,
    weeklyPct: null,
    fiveHourResetAt: null,
    weeklyResetAt: null,
    scopedLimits: scoped,
    plan: j.currentTier && (j.currentTier.name || j.currentTier.id) ? j.currentTier.name || j.currentTier.id : null,
    // Khong bia so: khong doc duoc muc nao thi noi thang la khong co, dung de trong im lang.
    noQuotaReason: scoped.length ? null : 'NO_QUOTA_IN_RESPONSE',
  };
}

// _internals: chi de test ANH XA DU LIEU khi may chua cai Gemini CLI that.
module.exports = { id: ID, name: NAME, detect, fetchUsage, baseDir, _internals: { groupQuotas, findQuotaArray, shortModel } };
