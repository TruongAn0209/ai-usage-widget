// ĐỌC CREDENTIAL CLAUDE TRÊN macOS — đây là chỗ khác hẳn bản Windows.
//
// Windows: Claude Code để token ở FILE `~/.claude/.credentials.json`.
// macOS  : Claude Code cất trong KEYCHAIN (mục generic password, service "Claude Code-credentials").
//          Máy này KHÔNG có file .credentials.json — đã kiểm 27/07.
//
// ⚠️ NGUYÊN TẮC BẢN MAC v1: CHỈ ĐỌC, KHÔNG BAO GIỜ GHI.
// Bản Windows có tự làm mới token (refresh_token xoay vòng → phải ghi đè lại chỗ lưu). Ở Mac tôi cố
// tình KHÔNG làm việc đó: nếu ghi hỏng Keychain là hỏng luôn đăng nhập Claude Code, mà lỗi
// kiểu đó rất khó lần ra. Token hết hạn thì widget báo thẳng "mở Claude Code để đăng nhập lại" —
// bản thân Claude Code tự làm mới khi được sử dụng.
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const KEYCHAIN_SERVICE = 'Claude Code-credentials'
const CRED_FILE = path.join(os.homedir(), '.claude', '.credentials.json')

function fromKeychain() {
  return new Promise((resolve) => {
    execFile('/usr/bin/security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
      { timeout: 8000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null)
        try { resolve(JSON.parse(stdout.trim())) } catch { resolve(null) }
      })
  })
}

function fromFile() {
  try {
    if (!fs.existsSync(CRED_FILE)) return null
    return JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'))
  } catch { return null }
}

// Trả { token, expiresAt, subscriptionType, source } hoặc { error }.
// KHÔNG bao giờ log/trả nguyên token ra ngoài module này ngoài chỗ dùng để gọi API.
async function readClaudeAuth() {
  let raw = await fromKeychain()
  let source = 'keychain'
  if (!raw) { raw = fromFile(); source = 'file' }
  if (!raw) return { error: 'NO_CREDENTIALS' }

  const o = raw.claudeAiOauth || raw
  const token = o.accessToken || o.access_token
  if (!token) return { error: 'NO_TOKEN' }

  const expiresAt = o.expiresAt || o.expires_at || null
  if (expiresAt && Date.now() > Number(expiresAt)) {
    return { error: 'EXPIRED', expiresAt, source }
  }
  return {
    token,
    expiresAt,
    subscriptionType: o.subscriptionType || o.subscription_type || null,
    source,
  }
}

module.exports = { readClaudeAuth, KEYCHAIN_SERVICE, CRED_FILE }
