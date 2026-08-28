// Provider: Grok Build CLI (xAI)
// Doc credential local cua CHINH MAY NGUOI DUNG. Token khong bao gio roi khoi may.
//
// ===== DA TRA CUU + DO THAT 22/07/2026 (grok 0.2.106, dang nhap oidc) =====
// Grok CO cho xem han muc, nhung CHI o 2 cho, ca hai deu KHONG script duoc:
//   1. Lenh `/usage` trong TUI tuong tac (go `grok` roi go /usage). Lenh nay KHONG co o
//      `grok --help`, cung KHONG co trong `availableCommands` cua che do agent/ACP.
//   2. Trang xAI Console tren web.
// Da thu va LOAI:
//   - `grok -p "/usage"` -> bi hieu la cau hoi binh thuong, khong chay lenh.
//   - JSON-RPC `x.ai/billing` qua `grok agent stdio` -> -32601 Method not found (0.2.106).
//   - /v1/rate_limits, /v1/usage, /v1/me tren cli-chat-proxy -> 404. /v1/models 200 nhung
//     KHONG kem header ratelimit nao. api.x.ai/v1/api-key -> 401 (token OIDC khong dung duoc).
//
// ===== NGUON DUY NHAT DUNG DUOC (chinh CLI cung goi cai nay) =====
//   POST https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig
//   header: authorization: Bearer <key trong ~/.grok/auth.json>, content-type: application/grpc-web+proto
//   body: khung grpc-web rong 5 byte [0,0,0,0,0]
// Log cua CLI ghi dung dong "billing: fetched credits config" -> xac nhan day la endpoint that.
// Tra ve protobuf (khong co file .proto) — da giai ma tay, cau truc THAT do duoc:
//   1.4.1 = epoch giay, dau chu ky   (do duoc: 2026-07-22)
//   1.5.1 = epoch giay, cuoi chu ky  (do duoc: 2026-07-29)  -> chu ky TUAN
//   1.8.x = lap lai cap moc tren     1.11 / 1.13 = co (=1)
//   1.2, 1.3, 1.12 = message RONG (0 byte)
//
// ⚠️ CHUA XAC MINH DUOC TRUONG PHAN TRAM. Tai khoan dang dung la ban DUNG THU MIEN PHI
// (TUI hien "try it out for free for a limited time! Upgrade for more usage"), khong co
// credit tra phi nen khong co so nao de doi chieu. Da chay tai that (2 bai benchmark) roi
// do lai: response KHONG DOI. => KHONG DOAN truong nao la phan tram (bai hoc cu: tung doan
// sai gap 3 lan). Chi doc khi server THUC SU tra ve so.
//
// Vi vay: neu tim thay so phan tram hop le -> hien 1 muc "Tuần" kem ngay reset that.
// Neu khong -> khong bia gi ca, chi bao co cai + da dang nhap.

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const ID = 'grok';
const NAME = 'Grok';
const BILLING_PATH = '/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig';

function baseDir(overrideDir) {
  return overrideDir || process.env.GROK_HOME || path.join(os.homedir(), '.grok');
}
function credPath(overrideDir) {
  return path.join(baseDir(overrideDir), 'auth.json');
}

// auth.json dang { "https://auth.x.ai::<uuid>": { key, refresh_token, email, expires_at, ... } }
function readEntry(overrideDir) {
  const raw = JSON.parse(fs.readFileSync(credPath(overrideDir), 'utf8'));
  return Object.values(raw || {}).find((e) => e && typeof e === 'object' && e.key) || null;
}
function readEntryKey(overrideDir) {
  const raw = JSON.parse(fs.readFileSync(credPath(overrideDir), 'utf8'));
  return Object.keys(raw || {}).find((k) => raw[k] && raw[k].key) || null;
}

// ---- Tu lam moi token OIDC ------------------------------------------------
// Token cua Grok song ngan (do that 23/07/2026: het han sau ~vai tieng). Truoc day provider
// chi doc expires_at roi nem EXPIRED -> muc Grok bien mat khoi widget, y het loi Claude sang
// cung ngay (Dot 13). auth.json CO san refresh_token + oidc_issuer + oidc_client_id.
// Token endpoint lay tu discovery that cua auth.x.ai (/.well-known/openid-configuration):
//   POST https://auth.x.ai/oauth2/token, form-encoded, grant_type=refresh_token
//   client auth "none" duoc phep -> chi can client_id, khong can secret.
const REFRESH_SKEW_MS = 5 * 60 * 1000;

function postForm(url, form) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(form).toString();
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(body),
        },
        timeout: 20000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', () => reject(new Error('NETWORK')));
    req.write(body);
    req.end();
  });
}

// Ghi lai auth.json: giu nguyen moi khoa/muc khac, ghi atomic.
function persistEntry(overrideDir, patch) {
  try {
    const p = credPath(overrideDir);
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const k = Object.keys(raw).find((x) => raw[x] && raw[x].key);
    if (!k) return;
    raw[k] = { ...raw[k], ...patch };
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(raw, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, p);
  } catch {
    // khong ghi duoc thi van dung token trong bo nho phien nay
  }
}

let refreshInFlight = null;
function refreshToken(overrideDir) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const entry = readEntry(overrideDir);
    if (!entry || !entry.refresh_token) throw new Error('EXPIRED');
    const issuer = (entry.oidc_issuer || 'https://auth.x.ai').replace(/\/+$/, '');
    const form = { grant_type: 'refresh_token', refresh_token: entry.refresh_token };
    if (entry.oidc_client_id) form.client_id = entry.oidc_client_id;
    const res = await postForm(issuer + '/oauth2/token', form);
    if (res.status !== 200) throw new Error('EXPIRED');
    let j;
    try {
      j = JSON.parse(res.body);
    } catch {
      throw new Error('EXPIRED');
    }
    if (!j.access_token) throw new Error('EXPIRED');
    const patch = {
      key: j.access_token,
      expires_at: new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000).toISOString(),
    };
    if (j.refresh_token) patch.refresh_token = j.refresh_token; // co the xoay vong
    persistEntry(overrideDir, patch);
    return patch.key;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function detect(overrideDir) {
  try {
    if (!fs.existsSync(credPath(overrideDir))) return false;
    return !!readEntry(overrideDir);
  } catch {
    return false;
  }
}

// ---- protobuf toi gian: chi doc du de lay moc thoi gian + so phan tram neu co ----
function readVarint(b, i) {
  let r = 0n;
  let s = 0n;
  while (i < b.length) {
    const x = b[i++];
    r |= BigInt(x & 0x7f) << s;
    if (!(x & 0x80)) break;
    s += 7n;
  }
  return [r, i];
}

// Duyet toan bo message, gom lai: cac moc epoch giay va cac so thuc 0..100.
function scan(b, out, depth) {
  if (depth > 6) return;
  let i = 0;
  while (i < b.length) {
    let key;
    [key, i] = readVarint(b, i);
    const wire = Number(key & 7n);
    if (wire === 0) {
      let v;
      [v, i] = readVarint(b, i);
      const n = Number(v);
      if (n > 1.5e9 && n < 4e9) out.epochs.push(n); // moc thoi gian hop ly
    } else if (wire === 5) {
      if (i + 4 > b.length) return;
      out.numbers.push(b.readFloatLE(i));
      i += 4;
    } else if (wire === 1) {
      if (i + 8 > b.length) return;
      out.numbers.push(b.readDoubleLE(i));
      i += 8;
    } else if (wire === 2) {
      let len;
      [len, i] = readVarint(b, i);
      const n = Number(len);
      if (i + n > b.length) return;
      scan(b.subarray(i, i + n), out, depth + 1);
      i += n;
    } else {
      return; // wire type la -> dung, khong doan tiep
    }
  }
}

// Doc 1 truong theo DUONG DAN CU THE (vd [1,1]) thay vi vo bua "float dau tien tim thay".
// 23/07/2026 do lai byte that: response co TOI 3 float — 1.1 = 5.0, va 2 float nua nam trong
// cac muc lap 7.2 (=3.0 va 2.0, nhin nhu bang he so model). Cach cu "lay float dau tien trong
// 0..100" chi tinh co ma trung 1.1; doi thu tu byte mot cai la hien nham so cua bang he so.
function readFieldPath(buf, path) {
  let cur = buf;
  for (let level = 0; level < path.length; level++) {
    const want = path[level];
    const isLast = level === path.length - 1;
    let i = 0;
    let found = null;
    while (i < cur.length) {
      let key;
      [key, i] = readVarint(cur, i);
      const field = Number(key >> 3n);
      const wire = Number(key & 7n);
      if (wire === 0) {
        let v;
        [v, i] = readVarint(cur, i);
        if (field === want && isLast) return Number(v);
      } else if (wire === 5) {
        if (i + 4 > cur.length) return null;
        if (field === want && isLast) return cur.readFloatLE(i);
        i += 4;
      } else if (wire === 1) {
        if (i + 8 > cur.length) return null;
        if (field === want && isLast) return cur.readDoubleLE(i);
        i += 8;
      } else if (wire === 2) {
        let len;
        [len, i] = readVarint(cur, i);
        const n = Number(len);
        if (i + n > cur.length) return null;
        if (field === want && !isLast) found = cur.subarray(i, i + n);
        i += n;
      } else {
        return null; // wire type la -> dung, khong doan tiep
      }
    }
    if (isLast || !found) return null;
    cur = found;
  }
  return null;
}

// Boc khung grpc-web: [co 1 byte][do dai 4 byte BE][payload]; co & 0x80 = trailer.
function unframe(buf) {
  const msgs = [];
  let off = 0;
  while (off + 5 <= buf.length) {
    const flag = buf[off];
    const len = buf.readUInt32BE(off + 1);
    const payload = buf.subarray(off + 5, off + 5 + len);
    off += 5 + len;
    if (!(flag & 0x80)) msgs.push(payload);
  }
  return msgs;
}

function requestBilling(token) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from([0, 0, 0, 0, 0]);
    const req = https.request(
      {
        host: 'grok.com',
        path: BILLING_PATH,
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/grpc-web+proto',
          'content-length': body.length,
        },
        timeout: 20000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode === 401 || res.statusCode === 403) return reject(new Error('EXPIRED'));
          if (res.statusCode !== 200) return reject(new Error('HTTP_' + res.statusCode));
          resolve(Buffer.concat(chunks));
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', () => reject(new Error('NETWORK')));
    req.write(body);
    req.end();
  });
}

async function fetchUsage(overrideDir) {
  let entry;
  try {
    entry = readEntry(overrideDir);
  } catch (e) {
    throw new Error('CRED_READ:' + e.message);
  }
  if (!entry) throw new Error('NO_TOKEN');

  // Het han (hoac sap) -> tu lam moi thay vi nem EXPIRED lam Grok bien mat khoi bang
  let token = entry.key;
  const expMs = entry.expires_at ? new Date(entry.expires_at).getTime() : null;
  if (expMs && !Number.isNaN(expMs) && Date.now() > expMs - REFRESH_SKEW_MS) {
    token = await refreshToken(overrideDir);
  }

  const out = {
    providerId: ID,
    providerName: NAME,
    fiveHourPct: null,
    weeklyPct: null,
    fiveHourResetAt: null,
    weeklyResetAt: null,
    scopedLimits: [],
    plan: null,
  };

  let raw;
  try {
    try {
      raw = await requestBilling(token);
    } catch (e) {
      // Server van bao het han (vd dong ho lech) -> lam moi 1 lan roi thu lai
      if (e && e.message === 'EXPIRED') raw = await requestBilling(await refreshToken(overrideDir));
      else throw e;
    }
  } catch (e) {
    // Khong lay duoc billing thi van bao la co cai + da dang nhap, khong coi la loi chet.
    out.noQuotaReason = 'BILLING_' + (e.message || 'ERR');
    return out;
  }

  const acc = { epochs: [], numbers: [] };
  unframe(raw).forEach((m) => scan(m, acc, 0));

  // Cuoi chu ky = moc lon nhat trong tuong lai.
  const nowSec = Date.now() / 1000;
  const future = acc.epochs.filter((e) => e > nowSec).sort((a, b) => a - b);
  const resetAt = future.length ? future[future.length - 1] * 1000 : null;

  // Lay DUNG truong 1.1 (float duy nhat o muc goc cua message config). KHONG quet bua.
  // ⚠️ VAN CHUA XAC MINH day co dung la "% da dung" khong — xAI khong cong bo .proto.
  // Do duoc: 22/07 ra 1.0, 23/07 ra 5.0 (co tang khi dung, hop voi gia thuyet % da dung
  // nhung CHUA du de ket luan). Vi vay hien kem chu "chưa xác minh" de con so khong dung
  // mot minh nhu su that chac chan.
  let percent = readFieldPath(unframe(raw)[0] || Buffer.alloc(0), [1, 1]);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) percent = null;

  if (percent !== null) {
    out.scopedLimits.push({
      label: 'Tuần',
      pct: Math.round(percent * 10) / 10,
      resetAt,
      info: 'chưa xác minh · ' + (resetAt ? 'reset ' + new Date(resetAt).toLocaleDateString('vi-VN') : ''),
    });
  } else {
    // Chu ky doc duoc nhung khong co so % -> noi thang thay vi bia.
    //
    // 23/07/2026: da do lai sau khi doi sang tai khoan TRA PHI — van khong co truong phan tram.
    // => Day KHONG phai chuyen goi free, xAI don gian khong phat ra so do qua API billing.
    // Truoc day de scopedLimits RONG -> renderer khong co gi de ve -> muc Grok BIEN MAT hoan
    // toan khoi widget, nhin y het nhu chua dang nhap. Nay day ra 1 muc pct = null:
    // renderer hien "—" thay vi vong %, van bao duoc la "co cai nay, dang song".
    // pct = null (KHONG phai 0) la co y: 0 nghia la "chua dung gi", tu no da la mot con so bia.
    out.noQuotaReason = 'NO_PERCENT_IN_BILLING';
    out.weeklyResetAt = resetAt;
    out.scopedLimits.push({
      label: 'Grok · tuần',
      pct: null,
      resetAt,
      info: 'xAI không công bố hạn mức',
    });
  }
  return out;
}

module.exports = { id: ID, name: NAME, detect, fetchUsage, baseDir };
