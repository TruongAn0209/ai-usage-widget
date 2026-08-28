// Provider: Grok CLI (grok.com / SuperGrok).
//
// Grok CLI không dùng API key xAI thông thường cho hạn mức thuê bao. CLI lưu phiên OAuth
// trong ~/.grok/auth.json và lấy dữ liệu tín dụng từ billing endpoint của grok.com.
// Chỉ đọc file và gọi GET; tuyệt đối không làm mới hoặc ghi lại refresh token.
const fs = require('fs')
const os = require('os')
const path = require('path')
const https = require('https')

const ID = 'grok'
const NAME = 'Grok'
const AUTH_FILE = path.join(process.env.GROK_HOME || path.join(os.homedir(), '.grok'), 'auth.json')
const LOG_FILE = path.join(process.env.GROK_HOME || path.join(os.homedir(), '.grok'), 'logs', 'unified.jsonl')
const BILLING_PATH = '/billing?format=credits'

function readAuth(file = AUTH_FILE) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    const entry = Object.values(raw).find((value) => value && typeof value === 'object' && value.key)
    if (!entry || !entry.key) return { error: 'NO_TOKEN' }
    if (entry.expires_at && Date.now() >= new Date(entry.expires_at).getTime()) return { error: 'EXPIRED' }
    return { token: entry.key, plan: entry.subscription_tier || null }
  } catch {
    return { error: 'NO_CREDENTIALS' }
  }
}

function detect(file = AUTH_FILE) {
  return !readAuth(file).error
}

function getJson(token, request = https.request) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: 'grok.com', path: BILLING_PATH, method: 'GET', timeout: 15000,
      headers: {
        authorization: 'Bearer ' + token,
        accept: 'application/json',
        'user-agent': 'grok-cli-usage-widget',
        'x-grok-client-mode': 'billing',
      },
    }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        if (res.statusCode === 401) return reject(new Error('UNAUTHORIZED'))
        if (res.statusCode === 429) return reject(new Error('RATE_LIMITED'))
        if (res.statusCode === 403) return reject(new Error('GROK_BILLING_BLOCKED'))
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error('HTTP_' + res.statusCode))
        try { resolve(JSON.parse(body)) } catch { reject(new Error('BAD_JSON')) }
      })
    })
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')))
    req.on('error', reject)
    req.end()
  })
}

function finiteNumber(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function percent(value) {
  const n = finiteNumber(value)
  if (n == null) return null
  // Một số bản billing trả fraction, bản khác trả phần trăm.
  const pct = n >= 0 && n <= 1 ? n * 100 : n
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10))
}

function time(value) {
  if (!value) return null
  const n = finiteNumber(value)
  if (n != null) return n > 2e10 ? n : n * 1000
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : null
}

function findValue(value, names) {
  if (!value || typeof value !== 'object') return null
  for (const name of names) if (value[name] != null) return value[name]
  for (const child of Object.values(value)) {
    const found = findValue(child, names)
    if (found != null) return found
  }
  return null
}

function parseBilling(data, fallbackPlan = null) {
  const usage = findValue(data, ['creditUsagePercent', 'usagePercent'])
  const pct = percent(usage)
  const period = findValue(data, ['currentPeriod']) || {}
  const resetAt = time(period.end || findValue(data, ['billingPeriodEnd', 'endMonth']))
  const plan = findValue(data, ['subscriptionTier', 'subscription_tier']) || fallbackPlan
  return {
    ok: true,
    plan,
    metrics: pct == null ? [] : [{ key: 'weekly', label: 'Tuần', pct, resetAt }],
    unparsed: pct == null ? Object.keys(data || {}) : null,
  }
}

// Grok CLI đã tự lấy billing được nhưng endpoint web đôi khi chặn app ngoài bằng 403.
// Khi đó đọc bản ghi billing gần nhất do chính CLI ghi, chỉ dùng trong 24 giờ và ghi rõ là số cũ.
function readCachedBilling(file = LOG_FILE) {
  try {
    const stat = fs.statSync(file)
    if (Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000) return null
    const text = fs.readFileSync(file, 'utf8').slice(-4 * 1024 * 1024)
    for (const row of text.split(/\r?\n/).reverse()) {
      if (!row.includes('billing: fetched credits config')) continue
      let event
      try { event = JSON.parse(row) } catch { continue }
      const config = event?.ctx?.config
      if (!config) continue
      const result = parseBilling(config, config.subscriptionTier)
      if (!result.metrics.length) continue
      const fetchedAt = new Date(event.ts).getTime()
      const stamp = Number.isFinite(fetchedAt) ? new Date(fetchedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null
      result.metrics = result.metrics.map((metric) => ({ ...metric, stale: true, info: stamp ? `số từ Grok CLI lúc ${stamp}` : 'số từ Grok CLI' }))
      return result
    }
  } catch { /* không có log hoặc log hỏng → giữ lỗi mạng thật */ }
  return null
}

async function fetchUsage(file = AUTH_FILE, request = https.request) {
  const auth = readAuth(file)
  if (auth.error) return { ok: false, error: auth.error }
  try { return parseBilling(await getJson(auth.token, request), auth.plan) }
  catch (error) {
    if (error.message === 'GROK_BILLING_BLOCKED') {
      const cached = readCachedBilling()
      if (cached) return cached
    }
    return { ok: false, error: error.message || 'FETCH_FAILED' }
  }
}

module.exports = { id: ID, name: NAME, detect, fetchUsage, _parseBilling: parseBilling, _readAuth: readAuth, _readCachedBilling: readCachedBilling }
