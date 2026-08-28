const { _parseKey: parseKey, _parseCredits: parseCredits } = require('../src/providers/openrouter')

let failed = 0
function check(name, ok) { if (!ok) failed++; console.log(`${ok ? '✅' : '❌'} ${name}`) }

const result = parseKey({ data: { usage: 25.5, limit: 100, limit_remaining: 74.5, is_free_tier: false } })
check('OpenRouter đổi usage/limit thành phần trăm', result.metrics[0].pct === 25.5)
check('OpenRouter giữ số tiền đã dùng', result.metrics[0].info === '$25.50 / $100.00')
check('OpenRouter giữ số tiền còn lại', result.info === 'còn $74.50')
const unlimited = parseKey({ data: { usage: 2.5, limit: null, is_free_tier: true } })
check('OpenRouter không bịa phần trăm khi không có trần', unlimited.metrics.length === 0 && unlimited.plan === 'Free')
const credits = parseCredits({ data: { total_credits: 10, total_usage: 6.87 } })
check('OpenRouter ưu tiên credits tài khoản', credits.plan === 'Credits' && credits.metrics[0].pct === 68.7)
check('OpenRouter hiển thị số credits còn lại', credits.info === 'còn $3.13')

if (failed) process.exit(1)
