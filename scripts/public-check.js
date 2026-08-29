// Kiểm tra cây nguồn trước khi đẩy công khai. Không in nội dung nghi là bí mật ra terminal.
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const ignored = new Set(['.git', 'node_modules', 'dist'])
const required = ['LICENSE', 'PRIVACY.md', 'SECURITY.md', 'README.md',
  'apps/macos/package.json', 'apps/windows/package.json', 'site/index.html']
const forbiddenNames = [/^CODEX_.*\.md$/i, /^\.env(?:\.|$)/i, /^(?:auth|credentials?)\.json$/i]
const secretPatterns = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/i,
]
const privatePathPatterns = [
  /\/Users\/[^/\s]+\//,
  /[A-Z]:\\(?:Users|02_CLAUDE_WORKSPACE)\\/i,
  /NNA_WORKSPACE/i,
  /(?:BAO_CAO|CODEX_)[A-Z0-9_-]*\.md/i,
]

let failed = false
function fail(message) { failed = true; console.error('❌ ' + message) }

for (const name of required) {
  if (!fs.existsSync(path.join(root, name))) fail(`thiếu ${name}`)
}

function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    const rel = path.relative(root, full)
    if (forbiddenNames.some((pattern) => pattern.test(entry.name))) fail(`file không được public: ${rel}`)
    if (entry.isDirectory()) { visit(full); continue }
    if (!entry.isFile() || rel === path.join('scripts', 'public-check.js')) continue
    const buf = fs.readFileSync(full)
    if (buf.includes(0)) continue
    const text = buf.toString('utf8')
    if (secretPatterns.some((pattern) => pattern.test(text))) fail(`có chuỗi giống bí mật: ${rel}`)
    if (privatePathPatterns.some((pattern) => pattern.test(text))) fail(`có đường dẫn máy cá nhân: ${rel}`)
  }
}

visit(root)
if (failed) process.exit(1)
console.log('✅ cây nguồn không có file/chuỗi nhạy cảm đã biết')
