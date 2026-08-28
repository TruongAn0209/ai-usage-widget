// Kiểm cờ `partial` của todayStats() — chạy bằng Node thuần, không cần Electron:
//   node test/usage-tracker-partial.js
//
// Vì sao phải có file này (mục 3, codex soi ra 02/08): mỗi transcript chỉ đọc 4MB CUỐI và chỉ 20
// file mới nhất được cộng vào tokens/messages, trong khi `sessionsToday` đếm TOÀN BỘ file trong
// ngày. Ngày làm việc dày (>20 phiên) hoặc có phiên bị cắt thì tổng "hôm nay" THẤP HƠN thật mà
// không nói gì — `partial` là cờ bắt buộc phải bật đúng lúc.
//
// `usageTracker.js` đọc `~/.claude/projects/**` qua `os.homedir()` — dựng $HOME GIẢ trỏ vào thư
// mục tạm TRƯỚC KHI require module, để không đụng transcript thật của máy đang chạy test.
const fs = require('fs')
const path = require('path')
const os = require('os')

const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cuw-home-'))
process.env.HOME = TMP_HOME
const PROJECTS_DIR = path.join(TMP_HOME, '.claude', 'projects')

const tracker = require('../src/usageTracker')

let fail = 0
function check(tên, cond, extra) {
  if (!cond) fail++
  console.log(`${cond ? '✅' : '❌'} ${tên}${extra !== undefined ? ' — ' + extra : ''}`)
}

function writeSession(project, file, lines, mtimeOffsetMs = 0) {
  const dir = path.join(PROJECTS_DIR, project)
  fs.mkdirSync(dir, { recursive: true })
  const full = path.join(dir, file)
  fs.writeFileSync(full, lines.join('\n') + '\n')
  if (mtimeOffsetMs) {
    const t = new Date(Date.now() + mtimeOffsetMs)
    fs.utimesSync(full, t, t)
  }
}

function usageLine(tokens) {
  return JSON.stringify({
    message: { model: 'claude-opus-5', usage: { input_tokens: tokens, output_tokens: 0 } },
    timestamp: new Date().toISOString(), cwd: '/tmp/proj',
  })
}

async function main() {
  console.log('--- Ngày thường (≤20 phiên, file nhỏ) → KHÔNG partial ---')
  for (let i = 0; i < 5; i++) writeSession(`p${i}`, 's.jsonl', [usageLine(1000)])
  let t = await tracker.todayStats('auto')
  check('sessionsToday khớp sessionsCounted', t.sessionsToday === t.sessionsCounted, `${t.sessionsToday} vs ${t.sessionsCounted}`)
  check('partial = false', t.partial === false)

  console.log('\n--- Token Claude IDE được cộng riêng vào tổng hôm nay ---')
  const desktopDir = path.join(TMP_HOME, 'Library', 'Application Support', 'Claude')
  fs.mkdirSync(desktopDir, { recursive: true })
  fs.writeFileSync(path.join(desktopDir, 'buddy-tokens.json'), JSON.stringify({ 'tokens-today': { date: tracker._localDateKey(), tokens: 1234 } }))
  t = await tracker.todayStats('auto')
  check('IDE token được đọc đúng', t.desktopTokens === 1234, t.desktopTokens)
  check('tổng gồm CLI + IDE', t.tokens === 6234, t.tokens)

  console.log('\n--- >20 phiên hôm nay → sessionsCounted < sessionsToday → partial = true ---')
  for (let i = 5; i < 25; i++) writeSession(`p${i}`, 's.jsonl', [usageLine(500)])
  t = await tracker.todayStats('auto')
  check('sessionsToday = 25', t.sessionsToday === 25, t.sessionsToday)
  check('sessionsCounted bị chặn ở 20', t.sessionsCounted === 20, t.sessionsCounted)
  check('partial = true khi có phiên bị bỏ ngoài 20', t.partial === true)

  console.log('\n--- File transcript bị cắt đầu (đọc tail, "truncated") → partial = true ---')
  fs.rmSync(PROJECTS_DIR, { recursive: true, force: true })
  const bigDir = path.join(PROJECTS_DIR, 'big')
  fs.mkdirSync(bigDir, { recursive: true })
  const bigFile = path.join(bigDir, 's.jsonl')
  // Đệm dữ liệu rác cho vượt STAT_TAIL (4MB) TRƯỚC dòng usage thật, để readTail() phải cắt đầu.
  const filler = '// '.repeat(700000) + '\n'   // ~2.1MB/dòng đệm, lặp vài dòng cho chắc vượt 4MB
  fs.writeFileSync(bigFile, filler + filler + filler + usageLine(2000) + '\n')
  t = await tracker.todayStats('auto')
  check('vẫn cộng được token của phiên lớn', t.tokens > 0, t.tokens)
  check('partial = true vì file bị đọc cắt (chỉ đọc 4MB cuối)', t.partial === true)

  console.log(fail ? `\n❌ ${fail} ca sai` : '\n✅ tất cả đạt')
  fs.rmSync(TMP_HOME, { recursive: true, force: true })
  process.exit(fail ? 1 : 0)
}

main()
