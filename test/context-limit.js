// Kiểm hàm suy trần ngữ cảnh — chạy bằng Node thuần, không cần Electron:
//   node test/context-limit.js
//
// Vì sao phải có file này: 27/07 widget báo "200k" trong khi Claude Code chạy cửa sổ 1M.
// Gốc lỗi nằm gọn trong `contextLimitFor` (nhánh regex `[1m]` là code chết vì transcript không
// bao giờ ghi hậu tố đó), và cờ "ước tính" thì gắn NGƯỢC CHIỀU. Cả hai đều là lỗi logic thuần,
// test được không cần giao diện.
const { contextLimitFor } = require('../src/usageTracker')

let fail = 0
function check(tên, thật, mong) {
  const ok = JSON.stringify(thật) === JSON.stringify(mong)
  if (!ok) fail++
  console.log(`${ok ? '✅' : '❌'} ${tên}`)
  if (!ok) console.log(`     mong : ${JSON.stringify(mong)}\n     thật : ${JSON.stringify(thật)}`)
}
const g = (model, tokens, override) => {
  const r = contextLimitFor(model, tokens, override)
  return { limit: r.limit, inferred: r.inferred, source: r.source, ...(r.overLimit ? { overLimit: true } : {}) }
}

console.log('--- Tự động: dưới 200k thì KHÔNG chứng minh được gì → phải là ước tính ---')
// Đây chính là ca đã sai: phiên 1M mới dùng 83.867 token, bản cũ khẳng định chắc nịch trần 200k.
check('opus-5 · 83.867 token (ca lỗi thật 27/07)', g('claude-opus-5', 83867),
  { limit: 200000, inferred: true, source: 'guess' })
check('opus-5 · 1 token', g('claude-opus-5', 1), { limit: 200000, inferred: true, source: 'guess' })
check('đúng mốc 200.000 token', g('claude-opus-5', 200000), { limit: 200000, inferred: true, source: 'guess' })
check('model lạ, ít token', g('mo-hinh-la', 5000), { limit: 200000, inferred: true, source: 'guess' })

console.log('\n--- Tự động: vượt 200k là BẰNG CHỨNG CỨNG → chắc chắn, không rào ---')
check('vượt 1 token so với 200k', g('claude-opus-5', 200001), { limit: 1000000, inferred: false, source: 'evidence' })
check('291.872 token (ca test khói cũ)', g('claude-opus-5', 291872), { limit: 1000000, inferred: false, source: 'evidence' })
check('đúng mốc 1.000.000', g('claude-opus-5', 1000000), { limit: 1000000, inferred: false, source: 'evidence' })

console.log('\n--- Vượt mọi nấc đã biết → KHÔNG bịa phần trăm ---')
check('1.000.001 token', g('claude-opus-5', 1000001), { limit: null, inferred: false, source: 'unknown' })

console.log('\n--- Đặt tay thắng mọi phỏng đoán ---')
check('đặt 1M, mới dùng 83.867', g('claude-opus-5', 83867, '1000000'),
  { limit: 1000000, inferred: false, source: 'manual' })
check('đặt 200k, mới dùng 83.867', g('claude-opus-5', 83867, '200000'),
  { limit: 200000, inferred: false, source: 'manual' })
check('đặt tay dạng số (không phải chuỗi)', g('claude-opus-5', 83867, 1000000),
  { limit: 1000000, inferred: false, source: 'manual' })
check("'auto' phải rơi về tự suy", g('claude-opus-5', 83867, 'auto'),
  { limit: 200000, inferred: true, source: 'guess' })
check('undefined phải rơi về tự suy', g('claude-opus-5', 83867, undefined),
  { limit: 200000, inferred: true, source: 'guess' })
check('chuỗi rác phải rơi về tự suy', g('claude-opus-5', 83867, 'xyz'),
  { limit: 200000, inferred: true, source: 'guess' })
check('số 0 phải rơi về tự suy', g('claude-opus-5', 83867, '0'),
  { limit: 200000, inferred: true, source: 'guess' })

console.log('\n--- Đặt tay SAI (token vượt trần đã đặt) → vẫn tôn trọng nhưng phải báo ---')
check('đặt 200k nhưng đã dùng 300k', g('claude-opus-5', 300000, '200000'),
  { limit: 200000, inferred: false, source: 'manual', overLimit: true })

console.log('\n--- Model tự khai [1m] (hiện KHÔNG bao giờ xảy ra, giữ phòng hờ) ---')
check('claude-opus-5[1m]', g('claude-opus-5[1m]', 5000), { limit: 1000000, inferred: false, source: 'model' })
check('đặt tay vẫn thắng [1m]', g('claude-opus-5[1m]', 5000, '200000'),
  { limit: 200000, inferred: false, source: 'manual' })

console.log(`\n${fail ? '❌ HỎNG ' + fail + ' ca' : '✅ Tất cả đều đúng'}`)
process.exit(fail ? 1 : 0)
