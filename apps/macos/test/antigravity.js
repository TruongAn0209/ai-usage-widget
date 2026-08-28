// Kiểm hạn sử dụng của snapshot Antigravity — chạy bằng Node thuần, không cần Electron, không dò
// tiến trình/cổng thật (dùng đúng 2 hàm THUẦN đã xuất riêng cho test):
//   node test/antigravity.js
//
// Vì sao phải có file này (mục 7, codex soi ra 02/08): chỉ cần TỪNG có snapshot thì Antigravity
// được coi là còn tồn tại MÃI MÃI — số cũ nhiều ngày sau vẫn hiện %, nhãn chỉ có giờ HH:MM (không
// ngày/tuổi) nên trông như vừa đọc. `SNAPSHOT_MAX_AGE_MS` + `isSnapshotFresh` là chốt tuổi.
const { _isSnapshotFresh: isSnapshotFresh, SNAPSHOT_MAX_AGE_MS, _markStale: markStale } = require('../src/providers/antigravity')

let fail = 0
function check(tên, thật, mong) {
  const ok = JSON.stringify(thật) === JSON.stringify(mong)
  if (!ok) fail++
  console.log(`${ok ? '✅' : '❌'} ${tên}`)
  if (!ok) console.log(`     mong : ${JSON.stringify(mong)}\n     thật : ${JSON.stringify(thật)}`)
}

check('trần đúng 24 giờ', SNAPSHOT_MAX_AGE_MS, 24 * 60 * 60 * 1000)

const now = 1700000000000

console.log('--- Snapshot dưới 24 giờ vẫn còn dùng được ---')
check('vừa lưu (0 phút trước)', isSnapshotFresh({ savedAt: now, metrics: [] }, now), true)
check('23 giờ 59 phút trước', isSnapshotFresh({ savedAt: now - (23 * 3600000 + 59 * 60000), metrics: [] }, now), true)
check('đúng mốc 24 giờ (chưa vượt)', isSnapshotFresh({ savedAt: now - SNAPSHOT_MAX_AGE_MS, metrics: [] }, now), true)

console.log('\n--- Snapshot quá 24 giờ KHÔNG còn dùng được ---')
check('24 giờ 1 phút trước', isSnapshotFresh({ savedAt: now - SNAPSHOT_MAX_AGE_MS - 60000, metrics: [] }, now), false)
check('1 tuần trước', isSnapshotFresh({ savedAt: now - 7 * 86400000, metrics: [] }, now), false)

console.log('\n--- Snapshot hỏng (thiếu trường / sai kiểu) bị coi như KHÔNG CÓ ---')
check('null', isSnapshotFresh(null, now), false)
check('thiếu savedAt', isSnapshotFresh({ metrics: [] }, now), false)
check('savedAt là chuỗi thay vì số', isSnapshotFresh({ savedAt: 'hôm qua', metrics: [] }, now), false)

console.log('\n--- markStale: xoá đếm ngược, gắn nhãn giờ đọc được ---')
const snap = { savedAt: now, plan: 'Pro', metrics: [{ key: 'a', label: 'Gemini · 5 giờ', pct: 40, resetAt: now + 1000 }] }
const staled = markStale(snap)
check('vẫn ok:true (không biến mất khỏi widget)', staled.ok, true)
check('metric bị xoá resetAt (đếm ngược số cũ là sai)', staled.metrics[0].resetAt, null)
check('metric gắn stale:true', staled.metrics[0].stale, true)
check('info có chữ "agy đang tắt"', /agy đang tắt/.test(staled.metrics[0].info), true)

console.log(fail ? `\n❌ ${fail} ca sai` : '\n✅ tất cả đạt')
process.exit(fail ? 1 : 0)
