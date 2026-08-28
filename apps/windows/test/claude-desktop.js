const fs = require('fs');
const os = require('os');
const path = require('path');
const { _readDesktopUsage: readDesktopUsage, DESKTOP_USAGE_MAX_AGE_MS } = require('../src/providers/claude');

let failed = 0;
function check(name, condition) {
  if (!condition) failed++;
  console.log(`${condition ? '✅' : '❌'} ${name}`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-usage-claude-ide-'));
const file = path.join(dir, 'plan-usage-history.json');
const now = Date.now();

fs.writeFileSync(file, JSON.stringify({
  version: 2,
  samples: [
    { t: now - 20 * 60 * 1000, u: { fh: 8, sd: 25 } },
    { t: now - 2 * 60 * 1000, u: { fh: 16, sd: 28 } },
  ],
}));
const fresh = readDesktopUsage(file, now);
check('lấy mẫu Claude IDE mới nhất', fresh && fresh.sampledAt === now - 2 * 60 * 1000);
check('đọc hạn mức 5 giờ', fresh && fresh.fiveHourPct === 16);
check('đọc hạn mức tuần', fresh && fresh.weeklyPct === 28);
check('ghi rõ nguồn IDE', fresh && fresh.source === 'desktop-history');

fs.writeFileSync(file, JSON.stringify({
  version: 2,
  samples: [{ t: now - DESKTOP_USAGE_MAX_AGE_MS - 1, u: { fh: 99, sd: 99 } }],
}));
check('không dùng mẫu IDE quá cũ', readDesktopUsage(file, now) === null);

fs.rmSync(dir, { recursive: true, force: true });
if (failed) process.exit(1);
