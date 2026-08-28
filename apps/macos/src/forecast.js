// Dự báo lúc chạm 100% hạn mức.
// Ghi lại % theo thời gian cho từng mục, đo DỐC (%/giờ) bằng hồi quy tuyến tính trên cửa sổ gần
// đây, rồi chiếu tới mốc 100%.
//
// ⚠️ Cái khó: hạn mức là CỬA SỔ TRƯỢT — Claude 5 giờ tự tụt xuống khi để yên (đã đo: 35% → 3%).
//    Lấy 2 điểm bất kỳ trừ nhau là ra dốc âm hoặc dốc ảo khổng lồ. Nên:
//      · % TỤT đáng kể ⇒ cửa sổ đã trượt ⇒ XOÁ lịch sử, đếm lại từ đầu.
//      · Chỉ dự báo khi có ≥3 mẫu, trải ≥5 phút, và dốc đủ lớn.
//      · Dự báo chạm 100% SAU lúc reset ⇒ không phải lo ⇒ KHÔNG hiện gì (không doạ hão).
//    Thà KHÔNG hiện còn hơn hiện một con số bịa (bài học cũ: từng đoán ngưỡng sai gấp 3 lần).
//
// ★ Chỉ được gọi `update()` khi VỪA CÓ SỐ MỚI TỪ API (nhịp 180 giây trong main.js), tuyệt đối
//   không gọi theo nhịp cục bộ 8 giây. Bản Windows bị codex soi ra đúng lỗi này: nhồi cùng một
//   số đo nhiều lần làm lệch hồi quy (dày mẫu giả ở một điểm thời gian).

const WINDOW_MS = 45 * 60 * 1000   // chỉ dùng mẫu trong 45 phút gần nhất
const MIN_SPAN_MS = 5 * 60 * 1000  // mẫu phải trải ít nhất 5 phút
const MIN_SAMPLES = 3
const MIN_RATE = 0.5               // %/giờ — chậm hơn coi như đứng yên, không dự báo
const DROP_RESET = 2               // tụt quá 2 điểm % ⇒ cửa sổ đã trượt, quên lịch sử

const history = new Map()   // key -> [{ t, pct }]
const lastReset = new Map() // key -> resetAt cuối cùng thấy (đổi = cửa sổ mới)

// Khoá phải là ĐỊNH DANH (providerId|metricKey), KHÔNG phải nhãn hiển thị — hai hạn mức trùng
// nhãn (vd 2 AI cùng có mục "Tuần") mà dùng chung khoá là trộn lịch sử của nhau.
function bucketsOf(providers) {
  const out = []
  for (const p of providers || []) {
    if (!p || !p.ok) continue
    for (const m of p.metrics || []) {
      if (m.pct == null || !Number.isFinite(Number(m.pct))) continue
      if (m.stale) continue   // số cũ (snapshot) không dùng để đo tốc độ
      out.push({ key: p.id + '|' + m.key, pct: Number(m.pct), resetAt: m.resetAt || null })
    }
  }
  return out
}

// Hồi quy tuyến tính → dốc theo %/giờ
function slopePerHour(samples) {
  const n = samples.length
  const t0 = samples[0].t
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const s of samples) {
    const x = (s.t - t0) / 3600000
    sx += x; sy += s.pct; sxx += x * x; sxy += x * s.pct
  }
  const denom = n * sxx - sx * sx
  return denom ? (n * sxy - sx * sy) / denom : 0
}

// Trả về { 'providerId|metricKey': { etaMs, ratePerHour } } cho các mục dự báo được.
function update(providers, now = Date.now()) {
  const result = {}
  const seen = new Set()

  for (const b of bucketsOf(providers)) {
    seen.add(b.key)

    const prevReset = lastReset.get(b.key)
    if (prevReset && b.resetAt && prevReset !== b.resetAt) history.delete(b.key)  // cửa sổ mới
    if (b.resetAt) lastReset.set(b.key, b.resetAt)

    let arr = history.get(b.key) || []
    const last = arr[arr.length - 1]
    if (last && b.pct < last.pct - DROP_RESET) arr = []   // tụt = cửa sổ trượt → quên lịch sử cũ
    arr.push({ t: now, pct: b.pct })
    arr = arr.filter((s) => now - s.t <= WINDOW_MS)
    history.set(b.key, arr)

    if (arr.length < MIN_SAMPLES) continue
    if (arr[arr.length - 1].t - arr[0].t < MIN_SPAN_MS) continue
    if (b.pct >= 100) continue

    const rate = slopePerHour(arr)
    if (!Number.isFinite(rate) || rate < MIN_RATE) continue

    const etaMs = now + ((100 - b.pct) / rate) * 3600000
    if (b.resetAt && etaMs > b.resetAt) continue   // chạm 100% sau khi reset ⇒ không phải lo

    result[b.key] = { etaMs: Math.round(etaMs), ratePerHour: Math.round(rate * 10) / 10 }
  }

  for (const k of Array.from(history.keys())) if (!seen.has(k)) history.delete(k)
  return result
}

function reset() { history.clear(); lastReset.clear() }

module.exports = { update, reset, _slopePerHour: slopePerHour }
