// Provider: GPT Plus (xác thực qua Codex CLI / OpenAI ChatGPT).
// Đọc credential cục bộ (`~/.codex/auth.json`) rồi hỏi backend hạn mức của ChatGPT.
// Token không bao giờ rời khỏi máy, không tốn quota inference.
//
// ⚠️ CỐ Ý KHÔNG TỰ LÀM MỚI TOKEN — giống chính sách của provider Claude ở bản Mac này:
//    refresh_token xoay vòng, ghi hỏng file là hỏng luôn đăng nhập Codex CLI. Hết hạn thì
//    báo "mở Codex để đăng nhập lại", để chính CLI lo việc làm mới.
//
// ★ ĐỪNG dán cứng nhãn "5 giờ"/"Tuần" cho primary/secondary window. Đo thật ở bản Windows:
//   gói free → primary = 2.592.000 giây (30 NGÀY); gói Plus → primary = 604.800 giây (7 ngày).
//   Không gói nào là 5 giờ ⇒ nhãn dán cứng là SAI SỰ THẬT. Suy nhãn từ độ dài cửa sổ thật.
const fs = require('fs')
const os = require('os')
const path = require('path')
const https = require('https')

const ID = 'codex'
// Backend WHAM là hạn mức gói ChatGPT, không chỉ riêng lệnh Codex.
// Dùng đúng nhãn người dùng nhìn thấy trong ChatGPT; id `codex` giữ nguyên để không làm mất
// cài đặt bật/tắt và thứ tự widget đã lưu từ các bản cũ.
const NAME = 'GPT Plus'

const credPath = (dir) => path.join(dir || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'auth.json')

// Chỉ tính là "có" khi đăng nhập kiểu OAuth (có access_token). API key rời (OPENAI_API_KEY)
// không có endpoint hạn mức theo gói ChatGPT nên không dùng được ở đây.
function detect(dir) {
  try {
    const auth = JSON.parse(fs.readFileSync(credPath(dir), 'utf8'))
    return !!(auth.tokens && auth.tokens.access_token)
  } catch { return false }
}

function pct(n) {
  if (n == null || Number.isNaN(Number(n))) return null
  return Math.max(0, Math.min(100, Math.round(Number(n) * 10) / 10))
}
function toMs(v) {
  if (v == null) return null
  if (typeof v === 'number') return v > 2e10 ? v : v * 1000   // epoch giây → ms
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

// Nhãn suy từ độ dài cửa sổ THẬT (sai số 10% để chịu được số làm tròn của OpenAI).
function windowLabel(sec) {
  if (!sec || sec <= 0) return 'Hạn mức'
  const near = (t) => Math.abs(sec - t) <= t * 0.1
  if (near(18000)) return '5 giờ'
  if (near(604800)) return 'Tuần'
  const days = Math.round(sec / 86400)
  if (days >= 1) return days + ' ngày'
  return Math.round(sec / 3600) + ' giờ'
}

function getJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers, timeout: 20000 }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) return reject(new Error('EXPIRED'))
        if (res.statusCode === 429) return reject(new Error('RATE_LIMITED'))
        if (res.statusCode !== 200) return reject(new Error('HTTP_' + res.statusCode))
        try { resolve(JSON.parse(body)) } catch { reject(new Error('BAD_JSON')) }
      })
    })
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')))
    req.on('error', () => reject(new Error('NETWORK')))
    req.end()
  })
}

async function fetchUsage(dir) {
  let tokens
  try { tokens = (JSON.parse(fs.readFileSync(credPath(dir), 'utf8')).tokens) || {} }
  catch { return { ok: false, error: 'NO_CREDENTIALS' } }
  if (!tokens.access_token) return { ok: false, error: 'NO_TOKEN' }

  const headers = { authorization: 'Bearer ' + tokens.access_token, 'content-type': 'application/json' }
  if (tokens.account_id) headers['chatgpt-account-id'] = tokens.account_id

  let data
  try { data = await getJson('https://chatgpt.com/backend-api/wham/usage', headers) }
  catch (e) { return { ok: false, error: e.message || 'FETCH_FAILED' } }

  const rl = data.rate_limit || {}
  const metrics = []
  for (const [slot, w] of [['primary', rl.primary_window], ['secondary', rl.secondary_window]]) {
    if (!w || w.used_percent == null) continue
    metrics.push({
      key: slot,
      label: windowLabel(w.limit_window_seconds),
      pct: pct(w.used_percent),
      resetAt: toMs(w.reset_at),
    })
  }
  return {
    ok: true,
    plan: data.plan_type || null,
    metrics: metrics.filter((m) => m.pct != null),
    unparsed: metrics.length === 0 ? Object.keys(data) : null,
  }
}

module.exports = { id: ID, name: NAME, detect, fetchUsage }
