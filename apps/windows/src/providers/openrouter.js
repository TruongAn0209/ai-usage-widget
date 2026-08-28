// Provider: OpenRouter (key cua Linh Anh / Hermes)
//
// Chi doc OPENROUTER_API_KEY tu .env cuc bo cua Hermes va goi endpoint read-only
// GET /api/v1/key. Key khong bao gio duoc gui sang renderer, luu vao config hay log.

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const ID = 'openrouter';
const NAME = 'OpenRouter · Linh Anh';

function envPath(overrideDir) {
  // overrideDir cho phep nguoi dung tro den thu muc Hermes khac trong config neu can.
  if (overrideDir) {
    return overrideDir.toLowerCase().endsWith('.env') ? overrideDir : path.join(overrideDir, '.env');
  }
  if (process.env.HERMES_ENV_PATH) return process.env.HERMES_ENV_PATH;
  return path.join(os.homedir(), 'AppData', 'Local', 'hermes', '.env');
}

function readApiKey(overrideDir) {
  const text = fs.readFileSync(envPath(overrideDir), 'utf8');
  // .env co the dung "export KEY=...", dau cach va gia tri boc quote.
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[1].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value && !value.startsWith('#')) return value;
  }
  return null;
}

function detect(overrideDir) {
  try {
    return !!readApiKey(overrideDir);
  } catch {
    return false;
  }
}

function requestCurrentKey(key) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: 'openrouter.ai',
        path: '/api/v1/key',
        method: 'GET',
        headers: { authorization: 'Bearer ' + key },
        timeout: 20000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', () => reject(new Error('NETWORK')));
    req.end();
  });
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? '$' + n.toFixed(2) : '—';
}

// OpenRouter reset key limit luc 00:00 UTC. Tra ve null neu key khong dat chu ky limit.
function nextReset(reset) {
  if (!['daily', 'weekly', 'monthly'].includes(reset)) return null;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (reset === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  if (reset === 'weekly') {
    const untilMonday = (8 - d.getUTCDay()) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + untilMonday);
  }
  if (reset === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1, 1);
  return d.getTime();
}

async function fetchUsage(overrideDir) {
  let key;
  try {
    key = readApiKey(overrideDir);
  } catch (e) {
    throw new Error('CRED_READ:' + e.message);
  }
  if (!key) throw new Error('NO_TOKEN');

  const res = await requestCurrentKey(key);
  if (res.status === 401 || res.status === 403) throw new Error('EXPIRED');
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (res.status !== 200) throw new Error('HTTP_' + res.status);

  let data;
  try {
    data = JSON.parse(res.body).data;
  } catch {
    throw new Error('BAD_JSON');
  }
  if (!data || typeof data !== 'object') throw new Error('BAD_JSON');

  const usage = Number(data.usage);
  const limit = Number(data.limit);
  const hasLimit = Number.isFinite(limit) && limit > 0;
  const hasUsage = Number.isFinite(usage);
  const reset = data.limit_reset;
  const resetAt = nextReset(reset);
  const limitLabel = reset === 'daily' ? 'ngày' : reset === 'weekly' ? 'tuần' : reset === 'monthly' ? 'tháng' : 'key';
  const info = hasLimit
    ? `${money(usage)} / ${money(limit)} · ${limitLabel}`
    : hasUsage
      ? `${money(usage)} đã dùng · chưa đặt hạn mức key`
      : 'OpenRouter không trả dữ liệu chi tiêu';

  return {
    providerId: ID,
    providerName: NAME,
    fiveHourPct: null,
    weeklyPct: null,
    fiveHourResetAt: null,
    weeklyResetAt: null,
    scopedLimits: [{
      label: 'Chi tiêu',
      pct: hasLimit && hasUsage ? Math.round((usage / limit) * 1000) / 10 : null,
      resetAt,
      info,
    }],
    plan: data.is_free_tier ? 'free' : null,
    noQuotaReason: hasLimit ? null : 'NO_KEY_LIMIT',
  };
}

module.exports = { id: ID, name: NAME, detect, fetchUsage, envPath, _internals: { nextReset } };
