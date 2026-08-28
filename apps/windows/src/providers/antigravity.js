// Provider: Antigravity (Google IDE, chay tren Codeium/Gemini language server noi bo)
// KHAC HAN Claude/Codex: khong co 1 file token don gian de doc + goi thang API tu xa.
// Antigravity phai DANG CHAY (CLI `agy` hoac IDE) thi widget moi thay duoc usage, vi cach
// duy nhat la noi chuyen voi language server dang chay CUC BO tren may (RPC noi bo qua
// cong TCP no dang lang nghe), khong phai goi may chu Google tu xa.
//
// DA TEST THAT 22/07/2026 voi tien trinh agy.exe dang chay that (lenh `agy` trong PowerShell):
//   - Ten tien trinh la "agy" (khong phai "antigravity"), cmdline KHONG co tham so gi ca.
//   - agy.exe mo 2 cong TCP rieng: 1 cong HTTPS + 1 cong HTTP (vd 56407 https / 56408 http).
//   - GetUnleashData va GetUserStatus tra ve 200 OK MA KHONG CAN header CSRF gi het
//     (khac gia thuyet ban dau dua theo tool cong dong — tool do nham cho VSCode extension,
//     con CLI `agy` don than khong bat CSRF).
//   - Response GetUserStatus that (verbatim field, KHONG phai doan):
//       userStatus.email, userStatus.planStatus.planInfo.planName,
//       userStatus.planStatus.planInfo.monthlyPromptCredits (han muc credit/thang),
//       userStatus.planStatus.availablePromptCredits (con lai),
//       userStatus.cascadeModelConfigData.clientModelConfigs[] — moi model co
//         .label, .modelId, .quotaInfo.remainingFraction (0..1, CON LAI khong phai da dung),
//         .quotaInfo.resetTime (ISO). Nhieu model dung CHUNG 1 remainingFraction+resetTime
//         (vd tat ca Gemini Flash/Pro dung chung 1 "quota nhom"), giong dung cach CLI that
//         gom nhom hien thi "GEMINI MODELS" / "CLAUDE AND GPT MODELS" trong `agy usage`.
//
// Cach dò tien trinh (van giu, van dung):
//   1. Tim tien trinh co ten khop /agy|antigrav|codeium/ (khong bat buoc co CSRF trong cmdline)
//   2. Neu co --csrf_token trong cmdline thi dung, khong co cung khong sao
//   3. Tim cong (port) tien trinh do dang lang nghe (netstat tren Windows, lsof tren macOS/
//      Linux), thu ca https lan http
//   4. Goi POST /exa.language_server_pb.LanguageServerService/GetUserStatus (Connect RPC, JSON)
//
// Ho tro Windows (powershell + netstat, da test that) VA macOS/Linux (ps + lsof, cung 1 co
// che RPC noi bo — chi khac cach do tien trinh/cong cua he dieu hanh). Vá 03/08/2026: agy
// tren Mac truoc gio luon bien mat khoi widget vi detect() khoa cung platform === 'win32'.

const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const ID = 'antigravity';
const NAME = 'Antigravity';

const CACHE_TTL_MS = 30000; // dung lai ket qua do tien trinh/cong toi da 30s, khoi phai quet lien tuc

let cache = { checkedAt: 0, running: false, port: null, isHttps: false, csrfToken: null };
let refreshing = null; // chan quet trung nhau khi nhieu noi cung goi

function isStale() {
  return Date.now() - cache.checkedAt > CACHE_TTL_MS;
}

function execFileAsync(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 6000, maxBuffer: 4 * 1024 * 1024, ...opts }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

function extractCsrfToken(cmdline) {
  if (!cmdline) return null;
  let m = cmdline.match(/--csrf_token=("[^"]*"|'[^']*'|[^\s"']+)/);
  if (!m) m = cmdline.match(/--csrf_token\s+("[^"]*"|'[^']*'|[^\s"']+)/);
  if (!m) return null;
  return m[1].replace(/^['"]|['"]$/g, '');
}

// Tim tien trinh Antigravity dang chay. CSRF token neu co trong cmdline thi lay them,
// nhung khong bat buoc — CLI `agy` thuong khong dat token nao vao tham so ca.
async function findCandidateProcesses() {
  if (process.platform === 'win32') return findCandidateProcessesWin32();
  if (process.platform === 'darwin' || process.platform === 'linux') return findCandidateProcessesUnix();
  return [];
}

async function findCandidateProcessesWin32() {
  const script =
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'agy|antigrav|codeium' -or " +
    "$_.CommandLine -match 'antigrav|codeium' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";
  let out;
  try {
    out = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  } catch {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(out || 'null');
  } catch {
    return [];
  }
  if (!parsed) return [];
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .map((p) => ({ pid: p.ProcessId, csrfToken: extractCsrfToken(p.CommandLine) }))
    .filter((p) => p.pid);
}

// macOS/Linux: `ps` co san moi may, khong can quyen gi dac biet (chi thay tien trinh cua
// CHINH nguoi dung dang chay, giong `ps -ax` binh thuong).
async function findCandidateProcessesUnix() {
  let out;
  try {
    out = await execFileAsync('ps', ['-axo', 'pid=,comm=']);
  } catch {
    return [];
  }
  const list = [];
  for (const line of (out || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sp = trimmed.indexOf(' ');
    if (sp < 0) continue;
    const pid = Number(trimmed.slice(0, sp));
    const comm = trimmed.slice(sp + 1).trim();
    if (!pid || !/agy|antigrav|codeium/i.test(comm)) continue;
    let csrfToken = null;
    try {
      const args = await execFileAsync('ps', ['-p', String(pid), '-o', 'command=']);
      csrfToken = extractCsrfToken(args);
    } catch {
      // khong lay duoc cmdline day du thi thoi, van dung PID nay khong CSRF
    }
    list.push({ pid, csrfToken });
  }
  return list;
}

// Cong TCP ma 1 PID dang lang nghe.
async function findListeningPorts(pid) {
  if (process.platform === 'win32') return findListeningPortsWin32(pid);
  if (process.platform === 'darwin' || process.platform === 'linux') return findListeningPortsUnix(pid);
  return [];
}

// Windows: netstat co san.
async function findListeningPortsWin32(pid) {
  let out;
  try {
    out = await execFileAsync('netstat.exe', ['-ano', '-p', 'TCP']);
  } catch {
    return [];
  }
  const ports = new Set();
  const re = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/gim;
  let m;
  while ((m = re.exec(out))) {
    if (String(m[2]) === String(pid)) ports.add(Number(m[1]));
  }
  return [...ports];
}

// macOS/Linux: lsof co san moi may (macOS mac dinh; hau het ban Linux desktop cung co san).
async function findListeningPortsUnix(pid) {
  let out;
  try {
    out = await execFileAsync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', String(pid)]);
  } catch {
    return [];
  }
  const ports = new Set();
  const re = /:(\d+)\s+\(LISTEN\)/g;
  let m;
  while ((m = re.exec(out || ''))) ports.add(Number(m[1]));
  return [...ports];
}

// Goi 1 request Connect-RPC (JSON) toi language server noi bo.
function rpcRequest(isHttps, port, rpcPath, bodyObj, csrfToken) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(bodyObj || {});
    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
      'connect-protocol-version': '1',
      'content-length': Buffer.byteLength(body),
    };
    if (csrfToken) headers['x-codeium-csrf-token'] = csrfToken;
    const mod = isHttps ? https : http;
    const req = mod.request(
      {
        host: '127.0.0.1',
        port,
        path: rpcPath,
        method: 'POST',
        headers,
        rejectUnauthorized: false,
        timeout: 4000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Xac nhan 1 cong dung la Connect API cua Antigravity (khong phai cong ngau nhien khac).
async function probePort(port, csrfToken) {
  for (const isHttps of [true, false]) {
    try {
      const res = await rpcRequest(
        isHttps,
        port,
        '/exa.language_server_pb.LanguageServerService/GetUnleashData',
        {},
        csrfToken
      );
      if (res.statusCode === 200 || res.statusCode === 401) return { ok: true, isHttps };
    } catch {
      // thu giao thuc con lai
    }
  }
  return { ok: false };
}

async function doRefresh() {
  const candidates = await findCandidateProcesses();
  for (const proc of candidates) {
    const ports = await findListeningPorts(proc.pid);
    for (const port of ports) {
      const probe = await probePort(port, proc.csrfToken);
      if (probe.ok) {
        cache = { checkedAt: Date.now(), running: true, port, isHttps: probe.isHttps, csrfToken: proc.csrfToken };
        return cache;
      }
    }
  }
  cache = { checkedAt: Date.now(), running: false, port: null, isHttps: false, csrfToken: null };
  return cache;
}

function refreshProcessInfo() {
  if (refreshing) return refreshing;
  refreshing = doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// ---- Nho lai so doc duoc lan cuoi, de Antigravity LUON hien tren bang ----
// Antigravity chi doc duoc khi tien trinh `agy` DANG CHAY (RPC noi bo). Truoc day tat agy la
// ca muc bien mat khoi widget. Nay: luu lai ket qua thanh cong gan nhat ra dia, agy tat thi
// van hien so cu KEM MOC GIO doc duoc — khong bao gio hien so cu ma giau chuyen no la so cu.
function snapshotPath() {
  let dir = process.env.APPDATA && path.join(process.env.APPDATA, 'claude-usage-widget');
  if (!dir && process.platform === 'darwin') {
    dir = path.join(os.homedir(), 'Library', 'Application Support', 'claude-usage-widget');
  }
  if (!dir && process.platform === 'linux') {
    dir = path.join(os.homedir(), '.config', 'claude-usage-widget');
  }
  return dir ? path.join(dir, 'antigravity-snapshot.json') : null;
}

function saveSnapshot(result) {
  const p = snapshotPath();
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ savedAt: Date.now(), result }), 'utf8');
  } catch {
    // khong ghi duoc thi thoi, khong lam hong luong chinh
  }
}

function loadSnapshot() {
  const p = snapshotPath();
  if (!p) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j && j.result && j.savedAt ? j : null;
  } catch {
    return null;
  }
}

// Danh dau ro day la so CU: moi muc kem "(số lúc HH:MM)" de khong ai nham voi so live.
function markStale(result, savedAt) {
  const tag = ' (số lúc ' + hhmm(savedAt) + ')';
  const out = JSON.parse(JSON.stringify(result));
  out.stale = true;
  out.staleAt = savedAt;
  out.scopedLimits = (out.scopedLimits || []).map((s) => ({
    ...s,
    resetAt: null, // dong dem nguoc cua so cu la sai -> bo di
    info: (s.info ? s.info : 'agy đang tắt') + tag,
  }));
  return out;
}

function hhmm(ms) {
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes());
}

// Dang chay tren may nay khong? Tra ve nhanh tu cache; neu cache cu thi tu lam moi ngam (khong cho).
// Co snapshot cu = van coi la "tim thay" -> muc Antigravity khong bien mat khi agy tat.
const SUPPORTED_PLATFORMS = new Set(['win32', 'darwin', 'linux']);
function detect() {
  if (!SUPPORTED_PLATFORMS.has(process.platform)) return false;
  if (isStale()) refreshProcessInfo(); // fire-and-forget, ket qua dung cho lan detect() sau
  if (cache.running) return true;
  return !!loadSnapshot();
}

function pct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}
function toMs(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

async function fetchUsage() {
  if (!SUPPORTED_PLATFORMS.has(process.platform)) return Promise.reject(new Error('UNSUPPORTED_OS'));
  if (isStale() || !cache.running) {
    await refreshProcessInfo();
  }
  // agy khong chay -> tra so cu (neu co) thay vi bao loi lam ca muc bien mat.
  if (!cache.running) {
    const snap = loadSnapshot();
    if (!snap) throw new Error('NOT_RUNNING');
    return markStale(snap.result, snap.savedAt);
  }

  let res;
  try {
    res = await rpcRequest(
      cache.isHttps,
      cache.port,
      '/exa.language_server_pb.LanguageServerService/GetUserStatus',
      { metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' } },
      cache.csrfToken
    );
  } catch {
    cache.running = false; // tien trinh co the vua dong -> lan sau quet lai tu dau
    throw new Error('NETWORK');
  }
  if (res.statusCode === 401 || res.statusCode === 403) {
    cache.running = false;
    throw new Error('EXPIRED');
  }
  if (res.statusCode !== 200) throw new Error('HTTP_' + res.statusCode);

  let j;
  try {
    j = JSON.parse(res.body);
  } catch {
    throw new Error('BAD_JSON');
  }

  const userStatus = (j && j.userStatus) || {};
  const planStatus = userStatus.planStatus || {};
  const planInfo = planStatus.planInfo || {};

  // ⛔ BO muc "Prompt credits" (An chot 23/07/2026): goi Pro khong con duoc cap pool nay
  // (Google chuyen credit thanh co che mua them), nen con so do chi gay nhieu chu khong
  // phai han muc that. Do duoc: monthlyPromptCredits=50000 nhung availablePromptCredits=500.
  const scopedLimits = [];

  // Cac model dung CHUNG 1 quota (remainingFraction + resetTime giong het nhau) -> gom lam 1
  // muc hien thi, giong dung cach CLI that gom nhom "GEMINI MODELS" / "CLAUDE AND GPT MODELS".
  const models = ((userStatus.cascadeModelConfigData || {}).clientModelConfigs || []).filter(
    (m) => m.quotaInfo && m.quotaInfo.remainingFraction !== undefined
  );
  const groups = new Map();
  for (const m of models) {
    const key = m.quotaInfo.remainingFraction + '|' + (m.quotaInfo.resetTime || '');
    if (!groups.has(key)) groups.set(key, { remainingFraction: m.quotaInfo.remainingFraction, resetTime: m.quotaInfo.resetTime, families: new Set() });
    const family = String(m.label || m.modelId || '').split(' ')[0];
    if (family) groups.get(key).families.add(family);
  }
  // Ghi ro DAY LA CUA SO 5 GIO. Do that 23/07/2026: resetTime cua moi nhom luon cach hien
  // tai ~5 tieng -> RPC noi bo CHI tra han muc 5 gio. Man hinh chinh chu cua Antigravity
  // con co "Weekly Limit" nhung so do KHONG co trong GetUserStatus, va da quet 13 ten RPC
  // khac tren language server (GetUsageLimits/GetQuotaInfo/GetRateLimitStatus/...) deu 404
  // -> Weekly phai hoi may chu Google, khong lay duoc tu may. KHONG bia ra muc Weekly.
  for (const g of groups.values()) {
    const family = [...g.families].slice(0, 3).join(' & ') || 'Models';
    scopedLimits.push({
      label: family + ' · 5 giờ',
      pct: pct((1 - g.remainingFraction) * 100),
      resetAt: toMs(g.resetTime),
    });
  }

  const result = {
    providerId: ID,
    providerName: NAME,
    fiveHourPct: null, // Antigravity khong tach ro 5h/tuan nhu Claude/Codex, xem het o scopedLimits
    weeklyPct: null,
    fiveHourResetAt: null,
    weeklyResetAt: null,
    scopedLimits,
    plan: planInfo.planName || null,
  };
  saveSnapshot(result); // de lan sau agy tat van con so ma hien
  return result;
}

// local:true = goi RPC noi bo tren may (khong phai may chu tu xa) -> khong co rui ro
// rate-limit nhu Claude/Codex, an toan de lam moi nhanh hon nhieu so voi san 180s.
module.exports = { id: ID, name: NAME, detect, fetchUsage, local: true };
