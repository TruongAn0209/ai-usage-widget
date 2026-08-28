// Provider: Claude Code (Anthropic)
// Doc credential local cua CHINH MAY NGUOI DUNG -> goi API cua Anthropic.
// Token khong bao gio roi khoi may. Endpoint usage khong ton quota.

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');

const ID = 'claude';
const NAME = 'Claude';
const desktopAppData = process.platform === 'win32'
  ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
  : path.join(os.homedir(), 'Library', 'Application Support');
const DESKTOP_USAGE_FILE = path.join(desktopAppData, 'Claude', 'plan-usage-history.json');
const DESKTOP_USAGE_MAX_AGE_MS = 30 * 60 * 1000;

// Claude Desktop/IDE ghi phần trăm 5 giờ + tuần riêng, không dùng credential Claude Code.
// Đường này giúp app vẫn hoạt động khi người dùng chỉ đăng nhập IDE hoặc OAuth CLI đã hết hạn.
function readDesktopUsage(file = DESKTOP_USAGE_FILE, now = Date.now()) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const samples = Array.isArray(raw.samples) ? raw.samples : [];
    const sample = [...samples].reverse().find((item) =>
      Number.isFinite(Number(item && item.t)) && item && item.u && typeof item.u === 'object');
    if (!sample) return null;
    const sampledAt = Number(sample.t);
    const age = now - sampledAt;
    if (age < -5 * 60 * 1000 || age > DESKTOP_USAGE_MAX_AGE_MS) return null;
    const fiveHourPct = Number(sample.u.fh);
    const weeklyPct = Number(sample.u.sd);
    if (!Number.isFinite(fiveHourPct) && !Number.isFinite(weeklyPct)) return null;
    return {
      providerId: ID,
      providerName: NAME,
      fiveHourPct: Number.isFinite(fiveHourPct) ? Math.max(0, Math.min(100, fiveHourPct)) : null,
      weeklyPct: Number.isFinite(weeklyPct) ? Math.max(0, Math.min(100, weeklyPct)) : null,
      fiveHourResetAt: null,
      weeklyResetAt: null,
      scopedLimits: [],
      plan: 'IDE',
      source: 'desktop-history',
      sampledAt,
    };
  } catch {
    return null;
  }
}

function credPath(overrideDir) {
  const dir = overrideDir || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(dir, '.credentials.json');
}

function baseDir(overrideDir) {
  return overrideDir || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

// Tren macOS, Claude Code CLI luu credential trong macOS Keychain (item "Claude Code-credentials",
// account = username hien tai) THAY VI ~/.claude/.credentials.json — vi vay may Mac khong co file
// nay van co the da dang nhap. Doc/ghi qua lenh `security` co san tren moi macOS; khong bao gio
// in/log noi dung tra ve (chua access token) ra console.
function keychainAccount() {
  return os.userInfo().username;
}

function readKeychainRaw() {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execFileSync(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-a', keychainAccount(), '-w'],
      { timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return out.toString('utf8').trim() || null;
  } catch {
    return null;
  }
}

function writeKeychainRaw(jsonStr) {
  // -U: cap nhat item co san neu trung service+account, khong thi tao moi.
  execFileSync(
    'security',
    ['add-generic-password', '-U', '-s', 'Claude Code-credentials', '-a', keychainAccount(), '-w', jsonStr],
    { timeout: 5000, stdio: ['ignore', 'ignore', 'ignore'] }
  );
}

// Nguon credential: uu tien file (Linux/Windows va macOS neu ai do dat CLAUDE_CONFIG_DIR rieng),
// khong co file thi thu Keychain (macOS). Tra ve ca 'source' de persistTokens() biet ghi lai dau.
function loadCredRaw(overrideDir) {
  const p = credPath(overrideDir);
  if (fs.existsSync(p)) {
    return { source: 'file', raw: fs.readFileSync(p, 'utf8') };
  }
  const kc = readKeychainRaw();
  if (kc) return { source: 'keychain', raw: kc };
  const e = new Error('ENOENT: khong thay file hoac Keychain item credential');
  e.code = 'ENOENT';
  throw e;
}

// Co dang nhap Claude Code tren may nay khong?
function detect(overrideDir) {
  try {
    const { raw } = loadCredRaw(overrideDir);
    const cred = JSON.parse(raw);
    return !!(cred.claudeAiOauth && cred.claudeAiOauth.accessToken);
  } catch {
    return !!readDesktopUsage();
  }
}

function readToken(overrideDir) {
  const { raw } = loadCredRaw(overrideDir);
  const cred = JSON.parse(raw);
  const oauth = cred.claudeAiOauth || {};
  return {
    token: oauth.accessToken,
    refreshToken: oauth.refreshToken,
    expiresAt: oauth.expiresAt,
    subscriptionType: oauth.subscriptionType,
  };
}

// --- Tu lam moi token (giong Claude Code) ---------------------------------
// Token OAuth song ~8 tieng. Neu widget chi doc file ma khong lam moi thi
// het han la 401 -> bang bao loi (người dùng gặp 23/07/2026).
const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const OAUTH_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const REFRESH_SKEW_MS = 5 * 60 * 1000; // lam moi truoc han 5 phut

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
        },
        timeout: 20000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', () => reject(new Error('NETWORK')));
    req.write(data);
    req.end();
  });
}

// Ghi lai credential da lam moi vao DUNG noi da doc ra (file atomic, hoac Keychain neu may
// nay dung Keychain) — giu nguyen moi khoa khac (mcpOAuth...).
function persistTokens(overrideDir, tok) {
  const { source, raw } = loadCredRaw(overrideDir);
  const cred = JSON.parse(raw);
  cred.claudeAiOauth = Object.assign({}, cred.claudeAiOauth, tok);
  const json = JSON.stringify(cred, null, 2);
  if (source === 'keychain') {
    writeKeychainRaw(json);
    return;
  }
  const p = credPath(overrideDir);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, json, { mode: 0o600 });
  fs.renameSync(tmp, p);
}

let refreshInFlight = null;
function refreshAccessToken(overrideDir) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const info = readToken(overrideDir);
    if (!info.refreshToken) throw new Error('EXPIRED');
    const res = await postJson(OAUTH_TOKEN_URL, {
      grant_type: 'refresh_token',
      refresh_token: info.refreshToken,
      client_id: OAUTH_CLIENT_ID,
    });
    if (res.status !== 200) throw new Error('EXPIRED');
    let j;
    try {
      j = JSON.parse(res.body);
    } catch {
      throw new Error('EXPIRED');
    }
    if (!j.access_token) throw new Error('EXPIRED');
    const tok = {
      accessToken: j.access_token,
      expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    };
    // refresh_token co the xoay vong -> phai luu lai, khong la lan sau hong
    if (j.refresh_token) tok.refreshToken = j.refresh_token;
    if (j.scopes) tok.scopes = j.scopes;
    try {
      persistTokens(overrideDir, tok);
    } catch {
      // khong ghi duoc thi van dung token trong bo nho phien nay
    }
    return { token: tok.accessToken, subscriptionType: info.subscriptionType };
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

// Version Claude Code (cho User-Agent) — thieu se bi 429.
let cachedVersion = null;
function detectVersion(overrideDir) {
  if (cachedVersion) return cachedVersion;
  cachedVersion = '2.1.217';
  try {
    const projects = path.join(baseDir(overrideDir), 'projects');
    let newest = null;
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.jsonl')) {
          const st = fs.statSync(full);
          if (!newest || st.mtimeMs > newest.mtimeMs) newest = { full, mtimeMs: st.mtimeMs };
        }
      }
    };
    walk(projects);
    if (newest) {
      const content = fs.readFileSync(newest.full, 'utf8');
      const m = content.match(/"version":"([0-9.]+)"/g);
      if (m && m.length) cachedVersion = m[m.length - 1].match(/([0-9.]+)/)[1];
    }
  } catch {
    // giu fallback
  }
  return cachedVersion;
}

function toMs(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}
function pct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}

// Nguon chinh: GET /api/oauth/usage (khong ton quota, co day du bucket)
async function fetchRemoteUsage(overrideDir) {
  let info;
  try {
    info = readToken(overrideDir);
  } catch (e) {
    throw new Error('CRED_READ:' + e.message);
  }
  if (!info.token) throw new Error('NO_TOKEN');

  // Het han (hoac sap het) -> lam moi truoc khi goi
  if (info.expiresAt && Date.now() > info.expiresAt - REFRESH_SKEW_MS) {
    info = await refreshAccessToken(overrideDir);
  }
  try {
    return await requestUsage(overrideDir, info);
  } catch (e) {
    // Server van bao het han (vd dong ho lech) -> thu lam moi 1 lan
    if (e && e.message === 'EXPIRED') {
      const fresh = await refreshAccessToken(overrideDir);
      return await requestUsage(overrideDir, fresh);
    }
    throw e;
  }
}

function requestUsage(overrideDir, info) {
  return new Promise((resolve, reject) => {
    const ver = detectVersion(overrideDir);

    const req = https.request(
      'https://api.anthropic.com/api/oauth/usage',
      {
        method: 'GET',
        headers: {
          authorization: 'Bearer ' + info.token,
          'anthropic-beta': 'oauth-2025-04-20',
          'user-agent': 'claude-code/' + ver,
          'content-type': 'application/json',
        },
        timeout: 20000,
      },
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
          const limits = Array.isArray(j.limits) ? j.limits : [];
          const byKind = (k) => limits.find((l) => l.kind === k);
          const session = byKind('session');
          const weeklyAll = byKind('weekly_all');
          const scoped = limits
            .filter((l) => l.kind === 'weekly_scoped')
            .map((l) => ({
              label: (l.scope && l.scope.model && l.scope.model.display_name) || 'Scoped',
              pct: pct(l.percent),
              resetAt: toMs(l.resets_at),
            }));
          const fh = j.five_hour || {};
          const wd = j.seven_day || {};
          resolve({
            providerId: ID,
            providerName: NAME,
            fiveHourPct: session ? pct(session.percent) : pct(fh.utilization),
            weeklyPct: weeklyAll ? pct(weeklyAll.percent) : pct(wd.utilization),
            fiveHourResetAt: session ? toMs(session.resets_at) : toMs(fh.resets_at),
            weeklyResetAt: weeklyAll ? toMs(weeklyAll.resets_at) : toMs(wd.resets_at),
            scopedLimits: scoped,
            plan: info.subscriptionType || null,
          });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', () => reject(new Error('NETWORK')));
    req.end();
  });
}

async function fetchUsage(overrideDir) {
  try {
    return await fetchRemoteUsage(overrideDir);
  } catch (error) {
    const desktop = readDesktopUsage();
    if (desktop) return desktop;
    throw error;
  }
}

module.exports = {
  id: ID, name: NAME, detect, fetchUsage, baseDir,
  _readDesktopUsage: readDesktopUsage,
  DESKTOP_USAGE_FILE, DESKTOP_USAGE_MAX_AGE_MS,
};
