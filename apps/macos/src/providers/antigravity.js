// Provider: Antigravity (IDE/CLI của Google, lệnh là `agy`).
//
// ★ KHÁC HẲN Claude/Codex về kiến trúc: KHÔNG có file token để gọi thẳng API từ xa. Phải có tiến
//   trình `agy` ĐANG CHẠY, vì widget nói chuyện với language server chạy CỤC BỘ qua RPC nội bộ.
//   `agy` mở 2 cổng loopback (1 HTTPS + 1 HTTP), trả 200 mà KHÔNG cần CSRF token hay header gì thêm.
//
// ★ Bản Windows chặn cứng `process.platform !== 'win32'` vì nó dò tiến trình bằng PowerShell và
//   netstat. Trên macOS làm được tương đương bằng `pgrep` + `lsof`:
//   POST https://127.0.0.1:<cổng>/exa.language_server_pb.LanguageServerService/GetUserStatus
//   → HTTP 200, gói "Pro", 11 model, `remainingFraction` 0.9962. Không phải suy đoán.
//
// ★ RPC nội bộ CHỈ có hạn mức ~5 GIỜ, KHÔNG có Weekly. Màn hình chính chủ Antigravity có hiện
//   Weekly, nhưng số đó phải hỏi máy chủ Google — lấy không được từ máy ⇒ KHÔNG bịa mục Weekly.
// Không hiện "Prompt credits": gói Pro không còn được cấp pool này, chỉ gây nhiễu.
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const https = require('https')
const http = require('http')

const ID = 'antigravity'
const NAME = 'Antigravity'
const RPC_PATH = '/exa.language_server_pb.LanguageServerService/GetUserStatus'
const SNAPSHOT = path.join(os.homedir(), 'Library', 'Application Support',
  'ai-usage-widget-mac', 'antigravity-snapshot.json')

// Dò tiến trình tốn kém (spawn 2 lệnh) → nhớ 30 giây. Không có cache thì mỗi nhịp 15 giây lại
// spawn `pgrep` + `lsof`, vừa phí vừa dễ làm giật.
const CACHE_MS = 30000
let cache = { at: 0, running: false, base: null }
let scanning = null

const run = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: 6000 }, (err, stdout) => resolve(err ? '' : String(stdout)))
})

// PID của `agy` đang chạy. Dùng tên tiến trình chính xác (`-x`), không dùng `-f`: `-f` sẽ bắt
// nhầm chính lệnh kiểm tra hoặc đường dẫn `antigravity.js` vì chúng cũng chứa chuỗi "agy".
async function findPid() {
  const out = await run('/usr/bin/pgrep', ['-i', '-x', 'agy'])
  for (const line of out.split('\n')) {
    const pid = parseInt(line.trim(), 10)
    if (Number.isFinite(pid)) return pid
  }
  return null
}

async function findPorts(pid) {
  const out = await run('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', String(pid)])
  const ports = []
  for (const line of out.split('\n')) {
    if (!/LISTEN/.test(line)) continue
    const m = line.match(/:(\d+)\s+\(LISTEN\)/)
    if (m) ports.push(Number(m[1]))
  }
  return ports
}

function rpc(scheme, port) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' } })
    const mod = scheme === 'https' ? https : http
    const req = mod.request({
      host: '127.0.0.1', port, path: RPC_PATH, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: 8000,
      rejectUnauthorized: false,   // chứng chỉ tự ký của language server cục bộ
    }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP_' + res.statusCode))
        try { resolve(JSON.parse(buf)) } catch { reject(new Error('BAD_JSON')) }
      })
    })
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')))
    req.on('error', reject)
    req.end(body)
  })
}

// Tìm đúng cổng nói chuyện được, rồi nhớ lại để lần sau khỏi dò.
async function scan() {
  const pid = await findPid()
  if (!pid) return { at: Date.now(), running: false, base: null }
  for (const port of await findPorts(pid)) {
    for (const scheme of ['https', 'http']) {
      try { await rpc(scheme, port); return { at: Date.now(), running: true, base: { scheme, port } } }
      catch { /* cổng này không phải, thử tiếp */ }
    }
  }
  return { at: Date.now(), running: false, base: null }
}

function refresh() {
  if (scanning) return scanning
  scanning = scan().then((c) => { cache = c; scanning = null; return c })
  return scanning
}

const fresh = () => Date.now() - cache.at < CACHE_MS

// `agy` tắt là mất sạch số → giữ ảnh chụp lần đọc gần nhất, nhưng phải NÓI RÕ đó là số cũ.
// Hạn mức thật của Antigravity là cửa sổ TRƯỢT 5 giờ — số càng để lâu càng vô nghĩa (đã reset lại
// không biết bao nhiêu lần). Quá 24 giờ thì coi như KHÔNG CÓ snapshot, đừng hiện % cũ như thể vẫn
// còn giá trị tham khảo (khác nhiều ngày so với số 5 giờ trước).
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000

function saveSnapshot(metrics, plan) {
  try {
    fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true })
    fs.writeFileSync(SNAPSHOT, JSON.stringify({ savedAt: Date.now(), plan, metrics }))
  } catch { /* mất snapshot không đáng để hỏng cả app */ }
}
// Xác thực schema tối thiểu trước khi tin dữ liệu: `savedAt` phải là số hữu hạn, `metrics` phải là
// mảng. Snapshot ghi dở dang (crash giữa lúc ghi) hoặc còn sót định dạng bản cũ hơn không được để
// lọt vào renderer — coi như KHÔNG có snapshot, giống hệt cách main.js đã làm với config.json
// (xem configSchema.js) chứ không im lặng cho qua rồi crash lúc render.
function loadSnapshot() {
  try {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
    if (!snap || !Number.isFinite(snap.savedAt) || !Array.isArray(snap.metrics)) return null
    return snap
  } catch { return null }
}
// Hàm THUẦN tách riêng để test được không cần dò tiến trình/đọc đĩa thật (xem test/antigravity.js) —
// cùng cách usageTracker.js xuất `contextLimitFor` ra ngoài để test được logic mà không cần Electron.
function isSnapshotFresh(snap, now = Date.now()) {
  return !!snap && Number.isFinite(snap.savedAt) && now - snap.savedAt <= SNAPSHOT_MAX_AGE_MS
}
function freshSnapshot() {
  const snap = loadSnapshot()
  return isSnapshotFresh(snap) ? snap : null
}

// Số cũ (dưới 24 giờ) thì BỎ đếm ngược (đếm ngược của số cũ là sai) và dán nhãn giờ đọc được.
function markStale(snap) {
  const d = new Date(snap.savedAt)
  const hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  return {
    ok: true, plan: snap.plan,
    metrics: (snap.metrics || []).map((m) => ({
      ...m, resetAt: null, stale: true, info: `agy đang tắt · số lúc ${hhmm}`,
    })),
  }
}

// Gộp các model DÙNG CHUNG một hạn mức thành 1 mục, giống cách chính CLI `agy` gộp
// "GEMINI MODELS" / "CLAUDE AND GPT-OSS MODELS" — 11 model mà hiện 11 dòng thì không đọc nổi.
function familyOf(label) {
  const s = String(label || '')
  if (/gemini/i.test(s)) return 'Gemini'
  if (/gpt/i.test(s)) return 'GPT-OSS'
  if (/claude/i.test(s)) return 'Claude'
  return s.split(' ')[0] || 'Khác'
}

function toMetrics(json) {
  const us = (json && json.userStatus) || {}
  const configs = (us.cascadeModelConfigData || {}).clientModelConfigs || []
  const groups = new Map()
  for (const m of configs) {
    const q = m.quotaInfo || {}
    if (q.remainingFraction == null) continue
    const key = `${q.remainingFraction}|${q.resetTime || ''}`
    if (!groups.has(key)) groups.set(key, { frac: Number(q.remainingFraction), reset: q.resetTime, families: new Set() })
    groups.get(key).families.add(familyOf(m.label))
  }
  const metrics = []
  for (const [key, g] of groups) {
    const t = g.reset ? new Date(g.reset).getTime() : null
    metrics.push({
      key,
      // Đổi sang "% ĐÃ DÙNG" theo quy ước chung. Giao diện chính chủ Antigravity hiện
      //   phần CÒN LẠI (97%) — cùng một sự thật, ngược chiều. Đừng "sửa" lại cho giống nó.
      label: [...g.families].join(' & ') + ' · 5 giờ',
      pct: Math.max(0, Math.min(100, (1 - g.frac) * 100)),
      resetAt: Number.isFinite(t) ? t : null,
      scoped: true,
    })
  }
  return metrics.sort((a, b) => b.pct - a.pct)
}

// Có snapshot cũ (dưới 24 giờ) cũng tính là "tìm thấy" → mục Antigravity không biến mất ngay khi
// Khi agy tắt, snapshot quá hạn thì không tính nữa để mục Antigravity
// tự rụng khỏi danh sách thay vì bám mãi vào một con số nhiều ngày tuổi.
function detect() {
  if (process.platform !== 'darwin') return false
  if (!fresh()) refresh()          // dò ngầm, kết quả dùng cho lần detect() sau (không chờ)
  return cache.running || !!freshSnapshot()
}

async function fetchUsage() {
  if (process.platform !== 'darwin') return { ok: false, error: 'UNSUPPORTED_OS' }
  if (!fresh() || !cache.running) await refresh()

  if (!cache.running) {
    // ★ Quá hạn (>24 giờ) thì KHÔNG dùng snapshot nữa — báo "agy đang tắt" trơn (không kèm %),
    //   thay vì hiện tiếp con số nhiều ngày tuổi như thể còn tham khảo được (codex soi ra 02/08).
    const snap = freshSnapshot()
    return snap ? markStale(snap) : { ok: false, error: 'NOT_RUNNING' }
  }

  let json
  try { json = await rpc(cache.base.scheme, cache.base.port) }
  catch { cache.running = false; return { ok: false, error: 'NOT_RUNNING' } }

  const us = json.userStatus || {}
  const plan = ((us.planStatus || {}).planInfo || {}).planName || null
  const metrics = toMetrics(json)
  if (metrics.length) saveSnapshot(metrics, plan)
  return { ok: true, plan, metrics }
}

// `local: true` = chạy bằng RPC CỤC BỘ, không gọi máy chủ từ xa ⇒ không dính sàn 180 giây (sàn
// đó đặt ra chỉ để tránh Anthropic trả 429). Bật `agy` lên là thấy trong ~15 giây, không phải 3 phút.
module.exports = {
  id: ID, name: NAME, local: true, detect, fetchUsage,
  _toMetrics: toMetrics, _isSnapshotFresh: isSnapshotFresh, _markStale: markStale,
  SNAPSHOT_MAX_AGE_MS,
}
