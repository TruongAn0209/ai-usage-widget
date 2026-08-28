const state = require('../src/providerState')
const { trySwapHotkey } = require('../src/hotkey')
const { providerResults, aggregateRefreshResults } = require('../src/refreshResult')

let failed = 0
function check(name, condition, detail = '') {
  if (!condition) failed++
  console.log(`${condition ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

state.providerGood.clear()
state.providerById.clear()
state.upsertProviders([
  { id: 'claude', name: 'Claude', ok: true, metrics: [{ key: '5h', pct: 40, resetAt: Date.now() + 1000 }] },
])
const failedRemote = state.upsertProviders([{ id: 'claude', name: 'Claude', ok: false, error: 'NETWORK' }])[0]
check('mạng lỗi giữ số tốt gần nhất', failedRemote.ok && failedRemote.stale && failedRemote.metrics.length === 1)
check('số cũ bỏ resetAt', failedRemote.metrics[0].resetAt === null)

state.providerGood.clear()
state.providerById.clear()
state.reconcileProviders([{ id: 'claude', name: 'Claude', ok: true, metrics: [] }], ['claude', 'codex'])
state.reconcileProviders([{ id: 'antigravity', name: 'Antigravity', local: true, ok: true, metrics: [] }], ['antigravity'])
state.reconcileProviders([], ['claude', 'codex'])
check('đang có → lượt sau rỗng → provider biến mất khỏi Map', !state.providerById.has('claude'))
check('reconcile remote không xoá provider local', state.providerById.has('antigravity'))
state.reconcileProviders([], ['antigravity'])
check('reconcile local rỗng xoá provider local', !state.providerById.has('antigravity'))

const registered = new Set(['Control+Alt+U'])
const shortcut = {
  register: (key) => {
    if (key.includes('#') || registered.has(key)) return false
    registered.add(key)
    return true
  },
  unregister: (key) => registered.delete(key),
}
check('hotkey nhập sai bị từ chối', trySwapHotkey(shortcut, () => {}, '###SAI###', 'Control+Alt+U') === false)
check('hotkey cũ vẫn còn sau khi hotkey mới lỗi', registered.has('Control+Alt+U'))
check('hotkey mới hợp lệ được đổi nguyên tử', trySwapHotkey(shortcut, () => {}, 'Control+Alt+Y', 'Control+Alt+U') === true)
check('hotkey mới còn và hotkey cũ đã bỏ', registered.has('Control+Alt+Y') && !registered.has('Control+Alt+U'))

const partial = aggregateRefreshResults([
  { providers: providerResults([{ id: 'claude', name: 'Claude', ok: true }, { id: 'codex', name: 'Codex', ok: false, error: 'NETWORK' }]) },
])
check('kết quả làm mới một phần được phân loại đúng', partial.status === 'partial' && partial.ok === false)
const totalFailure = aggregateRefreshResults([
  { providers: providerResults([{ id: 'claude', name: 'Claude', ok: false, error: 'NETWORK' }]) },
])
check('mọi provider lỗi được phân loại thất bại', totalFailure.status === 'failure' && totalFailure.failed === 1)

if (failed) {
  console.error(`\n❌ ${failed} ca sai`)
  process.exit(1)
}
console.log('\n✅ tất cả đạt')
