// Provider: OpenRouter API.
// Chỉ đọc trạng thái khóa hiện tại, không tạo/sửa/xóa khóa và không ghi credential.
const fs = require('fs')
const os = require('os')
const path = require('path')
const https = require('https')

const ID = 'openrouter'
const NAME = 'OpenRouter'
const API_PATH = '/api/v1/key'
const CREDITS_PATH = '/api/v1/credits'
const ENV_FILES = [
  path.join(os.homedir(), '.config', 'ai-usage-widget', 'openrouter.env'),
  path.join(os.homedir(), '.hermes', '.env'),
  path.join(os.homedir(), '.hermes', 'hermes-agent', '.env'),
]

function keyFromEnvFile(file) {
  try {
    const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((row) =>
      /^\s*OPENROUTER_API_KEY\s*=\s*[^#\s].*/.test(row))
    if (!line) return null
    const value = line.replace(/^\s*OPENROUTER_API_KEY\s*=\s*/, '').trim()
    return value.replace(/^['"]|['"]$/g, '') || null
  } catch { return null }
}

function readApiKey() {
  return process.env.OPENROUTER_API_KEY || ENV_FILES.map(keyFromEnvFile).find(Boolean) || null
}

function detect() { return !!readApiKey() }

function getJson(token, apiPath, request = https.request) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: 'openrouter.ai', path: apiPath, method: 'GET', timeout: 15000,
      headers: { authorization: 'Bearer ' + token, accept: 'application/json', 'user-agent': 'ai-usage-widget' },
    }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        if (res.statusCode === 401) return reject(new Error('UNAUTHORIZED'))
        if (res.statusCode === 429) return reject(new Error('RATE_LIMITED'))
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error('HTTP_' + res.statusCode))
        try { resolve(JSON.parse(body)) } catch { reject(new Error('BAD_JSON')) }
      })
    })
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')))
    req.on('error', reject)
    req.end()
  })
}

function number(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseKey(payload) {
  const data = payload && payload.data ? payload.data : {}
  const usage = number(data.usage)
  const limit = number(data.limit)
  const remaining = number(data.limit_remaining)
  const pct = limit != null && limit > 0 && usage != null
    ? Math.max(0, Math.min(100, Math.round((usage / limit) * 1000) / 10))
    : null
  const info = usage != null
    ? (limit != null ? `$${usage.toFixed(2)} / $${limit.toFixed(2)}` : `$${usage.toFixed(2)} đã dùng`)
    : null
  return {
    ok: true,
    plan: data.is_free_tier ? 'Free' : 'API',
    metrics: pct == null ? [] : [{ key: 'monthly', label: 'Hạn mức API', pct, resetAt: null, info }],
    info: remaining != null ? `còn $${remaining.toFixed(2)}` : info,
  }
}

function parseCredits(payload) {
  const data = payload && payload.data ? payload.data : {}
  const total = number(data.total_credits)
  const used = number(data.total_usage)
  if (total == null || used == null || total <= 0) return { ok: false, error: 'BAD_CREDITS' }
  const remaining = Math.max(0, total - used)
  return {
    ok: true,
    plan: 'Credits',
    metrics: [{ key: 'credits', label: 'Credits OpenRouter', pct: Math.max(0, Math.min(100, Math.round((used / total) * 1000) / 10)), resetAt: null,
      info: `$${used.toFixed(2)} / $${total.toFixed(2)} · còn $${remaining.toFixed(2)}` }],
    info: `còn $${remaining.toFixed(2)}`,
  }
}

async function fetchUsage(request = https.request) {
  const token = readApiKey()
  if (!token) return { ok: false, error: 'NO_API_KEY' }
  try { return parseCredits(await getJson(token, CREDITS_PATH, request)) }
  catch (creditsError) {
    try { return parseKey(await getJson(token, API_PATH, request)) }
    catch (keyError) { return { ok: false, error: keyError.message || creditsError.message || 'FETCH_FAILED' } }
  }
}

module.exports = { id: ID, name: NAME, detect, fetchUsage, _parseKey: parseKey, _parseCredits: parseCredits, _readApiKey: readApiKey }
