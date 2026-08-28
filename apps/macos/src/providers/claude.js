// Lấy SỐ THẬT mức dùng Claude từ API hạn mức của Anthropic.
//
// Nguồn (đã kiểm chứng ở bản Windows, giữ nguyên vì là API tài khoản, không phụ thuộc hệ điều hành):
//   GET https://api.anthropic.com/api/oauth/usage
//   header: Authorization: Bearer <access_token>  +  User-Agent: claude-code/<version>
//   ★ THIẾU User-Agent là ăn 429 dồn dập. Đây không phải mẹo, là bắt buộc.
//   ★ KHÔNG tốn quota inference — chỉ là API tra hạn mức.
//   ★ Sàn 180 giây/lần, ép trong main.js.
//
// QUY ƯỚC HIỂN THỊ: mọi mục đều là "% ĐÃ DÙNG", tăng dần. Không bao giờ ghi "còn lại".
// ⚠️ Thấy số TỤT không phải bug — hạn mức 5 giờ là CỬA SỔ TRƯỢT, để yên là tự nhả. Đừng đảo dấu.
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { readClaudeAuth } = require('./credentials')

let cachedUA = null
const DESKTOP_USAGE_FILE = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'plan-usage-history.json')
// Claude Desktop hiện ghi mẫu khoảng 15 phút/lần. Chỉ dùng mẫu trong 30 phút để tránh biến
// một con số từ phiên IDE cũ thành hạn mức “hiện tại”.
const DESKTOP_USAGE_MAX_AGE_MS = 30 * 60 * 1000

// User-Agent phải kèm version thật của Claude Code đang cài.
function claudeCodeUA() {
  if (cachedUA) return Promise.resolve(cachedUA)
  return new Promise((resolve) => {
    execFile('claude', ['--version'], { timeout: 5000 }, (err, stdout) => {
      const m = !err && stdout ? String(stdout).match(/(\d+\.\d+\.\d+)/) : null
      cachedUA = `claude-code/${m ? m[1] : '2.0.0'}`
      resolve(cachedUA)
    })
  })
}

// API trả nhiều dạng field tuỳ bản. Dò rộng thay vì đoán cứng một tên.
function pickPct(obj) {
  if (!obj || typeof obj !== 'object') return null
  for (const k of ['utilization', 'used_percent', 'usedPercent', 'percent_used', 'pct']) {
    const v = obj[k]
    if (typeof v === 'number' && isFinite(v)) return Math.max(0, Math.min(100, v))
  }
  return null
}
function pickReset(obj) {
  if (!obj || typeof obj !== 'object') return null
  for (const k of ['resets_at', 'reset_at', 'resetsAt', 'resetAt', 'expires_at']) {
    const v = obj[k]
    if (v) { const t = new Date(v).getTime(); if (isFinite(t)) return t }
  }
  return null
}

function desktopMetric(key, label, value, sampledAt) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const d = new Date(sampledAt)
  const hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  return {
    key, label,
    pct: Math.max(0, Math.min(100, n)),
    resetAt: null,
    info: `Claude IDE · cập nhật ${hhmm}`,
  }
}

// Claude Desktop/IDE có cache hạn mức riêng, không dùng access token Claude Code trong Keychain.
// Đọc cache này làm đường dự phòng khi người dùng chỉ đăng nhập IDE hoặc OAuth CLI đã hết hạn.
async function readDesktopUsage(file = DESKTOP_USAGE_FILE, now = Date.now()) {
  try {
    const raw = JSON.parse(await fs.promises.readFile(file, 'utf8'))
    const samples = Array.isArray(raw.samples) ? raw.samples : []
    const sample = [...samples].reverse().find((item) =>
      Number.isFinite(Number(item?.t)) && item?.u && typeof item.u === 'object')
    if (!sample) return null
    const sampledAt = Number(sample.t)
    const age = now - sampledAt
    if (age < -5 * 60 * 1000 || age > DESKTOP_USAGE_MAX_AGE_MS) return null
    const metrics = [
      desktopMetric('5h', '5 giờ', sample.u.fh, sampledAt),
      desktopMetric('7d', 'Tuần', sample.u.sd, sampledAt),
    ].filter(Boolean)
    if (!metrics.length) return null
    return { ok: true, plan: 'IDE', source: 'desktop-history', sampledAt, metrics }
  } catch { return null }
}

function getJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = require('https').request(url, { method: 'GET', headers, timeout: 15000 }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        if (res.statusCode === 401) return reject(new Error('UNAUTHORIZED'))
        if (res.statusCode === 429) return reject(new Error('RATE_LIMITED'))
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error('HTTP_' + res.statusCode))
        try { resolve(JSON.parse(body)) } catch { reject(new Error('BAD_JSON')) }
      })
    })
    req.on('timeout', () => { req.destroy(new Error('TIMEOUT')) })
    req.on('error', reject)
    req.end()
  })
}

async function fetchUsage() {
  const auth = await readClaudeAuth()
  if (auth.error) {
    return await readDesktopUsage() || { ok: false, error: auth.error }
  }

  const ua = await claudeCodeUA()
  let data
  try {
    data = await getJson('https://api.anthropic.com/api/oauth/usage', {
      Authorization: `Bearer ${auth.token}`,
      'User-Agent': ua,
      Accept: 'application/json',
    })
  } catch (e) {
    return await readDesktopUsage() || { ok: false, error: e.message || 'FETCH_FAILED' }
  }

  const metrics = []
  const five = data.five_hour || data.fiveHour
  if (five) metrics.push({ key: '5h', label: '5 giờ', pct: pickPct(five), resetAt: pickReset(five) })
  const week = data.seven_day || data.sevenDay
  if (week) metrics.push({ key: '7d', label: 'Tuần', pct: pickPct(week), resetAt: pickReset(week) })

  // ★ Bucket riêng theo model (Fable/Opus) nằm trong mảng limits[], KHÔNG phải field
  //   `seven_day_opus` (field đó luôn null — đừng dùng).
  const limits = Array.isArray(data.limits) ? data.limits : []
  for (const l of limits) {
    const name = l?.scope?.model?.display_name || l?.scope?.model?.name
    if (!name) continue
    metrics.push({
      key: 'm:' + name,
      label: name + (String(l.kind || '').includes('weekly') ? ' · tuần' : ''),
      pct: pickPct(l),
      resetAt: pickReset(l),
      scoped: true,
    })
  }

  return {
    ok: true,
    plan: auth.subscriptionType || data.subscription_type || null,
    source: auth.source,
    metrics: metrics.filter((m) => m.pct !== null),
    unparsed: metrics.length === 0 ? Object.keys(data) : null, // để chẩn đoán khi API đổi shape
  }
}

// Claude LUÔN được coi là "có mặt" — đây là AI chính của app, chưa đăng nhập thì phải hiện thẳng
// lỗi NO_CREDENTIALS cho người dùng biết đường xử, chứ không được im lặng biến mất khỏi bảng.
module.exports = {
  id: 'claude', name: 'Claude', detect: () => true, fetchUsage,
  _readDesktopUsage: readDesktopUsage,
  DESKTOP_USAGE_FILE, DESKTOP_USAGE_MAX_AGE_MS,
}
