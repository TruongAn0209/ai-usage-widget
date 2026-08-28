const { _parseBilling: parseBilling, _readCachedBilling: readCachedBilling } = require('../src/providers/grok')
const fs = require('fs')
const os = require('os')
const path = require('path')

let failed = 0
function check(name, condition) {
  if (!condition) failed++
  console.log(`${condition ? '✅' : '❌'} ${name}`)
}

const result = parseBilling({
  subscriptionTier: 'SuperGrok',
  currentPeriod: { type: 'USAGE_PERIOD_TYPE_WEEKLY', end: '2026-08-06T03:51:53.063763Z' },
  creditUsagePercent: 0.37,
})
check('Grok fraction được đổi thành phần trăm', result.metrics[0].pct === 37)
check('Grok giữ gói thuê bao', result.plan === 'SuperGrok')
check('Grok lấy mốc reset của kỳ hiện tại', result.metrics[0].resetAt === Date.parse('2026-08-06T03:51:53.063763Z'))

const noUsage = parseBilling({ subscriptionTier: 'SuperGrok', currentPeriod: {} })
check('thiếu phần trăm thì không bịa thanh usage', noUsage.metrics.length === 0 && Array.isArray(noUsage.unparsed))

const tmp = path.join(os.tmpdir(), `grok-widget-${process.pid}.jsonl`)
fs.writeFileSync(tmp, JSON.stringify({ ts: new Date().toISOString(), ctx: { config: {
  creditUsagePercent: 95, currentPeriod: { end: '2026-08-27T03:51:53.063763Z' }, subscriptionTier: 'SuperGrok',
} }, msg: 'billing: fetched credits config' }) + '\n')
const cached = readCachedBilling(tmp)
check('403 billing dùng số CLI gần nhất có gắn nhãn', cached && cached.metrics[0].stale && /Grok CLI/.test(cached.metrics[0].info))
fs.unlinkSync(tmp)

if (failed) process.exit(1)
