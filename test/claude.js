const fs = require('fs')
const os = require('os')
const path = require('path')
const { _readDesktopUsage: readDesktopUsage, DESKTOP_USAGE_MAX_AGE_MS } = require('../src/providers/claude')

let failed = 0
function check(name, condition, detail = '') {
  if (!condition) failed++
  console.log(`${condition ? '✅' : '❌'} ${name}${detail === '' ? '' : ' — ' + detail}`)
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-widget-ide-'))
const file = path.join(dir, 'plan-usage-history.json')
const now = Date.now()

async function run() {
  fs.writeFileSync(file, JSON.stringify({
    version: 2,
    samples: [
      { t: now - 20 * 60 * 1000, u: { fh: 8, sd: 25 } },
      { t: now - 2 * 60 * 1000, u: { fh: 16, sd: 28 } },
    ],
  }))
  const fresh = await readDesktopUsage(file, now)
  check('Claude IDE lấy mẫu mới nhất', fresh?.sampledAt === now - 2 * 60 * 1000, fresh?.sampledAt)
  check('Claude IDE đọc hạn mức 5 giờ', fresh?.metrics?.[0]?.pct === 16, fresh?.metrics?.[0]?.pct)
  check('Claude IDE đọc hạn mức tuần', fresh?.metrics?.[1]?.pct === 28, fresh?.metrics?.[1]?.pct)
  check('nguồn được ghi rõ là IDE', fresh?.source === 'desktop-history', fresh?.source)

  fs.writeFileSync(file, JSON.stringify({
    version: 2,
    samples: [{ t: now - DESKTOP_USAGE_MAX_AGE_MS - 1, u: { fh: 99, sd: 99 } }],
  }))
  check('không dùng số IDE quá cũ', await readDesktopUsage(file, now) === null)

  fs.writeFileSync(file, '{hỏng json')
  check('file IDE hỏng không làm provider văng lỗi', await readDesktopUsage(file, now) === null)
}

run().finally(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  if (failed) process.exit(1)
})
