// Sổ đăng ký AI. Thêm một AI = thêm 1 file trong thư mục này rồi nhét vào mảng ALL.
//
// Mỗi provider phải có: { id, name, detect(), fetchUsage() }
//   detect()     → true/false, RẺ và ĐỒNG BỘ (chỉ đọc file cục bộ, không gọi mạng)
//   fetchUsage() → { ok: true, plan, metrics: [{ key, label, pct, resetAt, scoped?, info? }] }
//                  hoặc { ok: false, error: 'MÃ_LỖI' }
//
// `local: true` = đọc bằng RPC CỤC BỘ (Antigravity), không gọi máy chủ từ xa ⇒ KHÔNG dính sàn
// 180 giây. Sàn đó đặt ra chỉ để tránh Anthropic trả 429, bắt Antigravity ăn theo là vô lý —
// bật `agy` lên phải đợi tới 3 phút mới thấy. main.js chạy nhịp riêng cho nhóm này.
//
const claude = require('./claude')
const codex = require('./codex')
const antigravity = require('./antigravity')
const grok = require('./grok')
const openrouter = require('./openrouter')

const ALL = [claude, codex, antigravity, grok, openrouter]

// Danh mục cho màn Cài đặt: AI nào có mặt trên máy, AI nào đang bị tắt.
function catalog(disabled = []) {
  return ALL.map((p) => ({
    id: p.id, name: p.name,
    available: safeDetect(p),
    enabled: !disabled.includes(p.id),
  }))
}

function safeDetect(p) {
  try { return p.detect() } catch { return false }
}

async function ask(list) {
  return Promise.all(list.map(async (p) => {
    try {
      const r = await p.fetchUsage()
      return { id: p.id, name: p.name, local: !!p.local, ...r }
    } catch (e) {
      return { id: p.id, name: p.name, local: !!p.local, ok: false, error: e.message || 'FETCH_FAILED' }
    }
  }))
}

// Chỉ hỏi những AI: (1) không bị tắt trong Cài đặt, (2) thật sự có trên máy.
// Tắt một AI là ngưng luôn cả bước dò của nó, không chỉ ẩn khỏi giao diện.
const active = (disabled) => ALL.filter((p) => !disabled.includes(p.id) && safeDetect(p))

// CHỈ lấy AI TỪ XA (`!p.local`) — AI cục bộ (Antigravity) có nhịp riêng nhanh hơn qua `fetchLocal`
// bên dưới (main.js gọi song song, không chờ nhau). Trước đây `fetchAll` gồm cả provider cục bộ,
// nên khi main.js thay CẢ MẢNG `lastProviders` bằng kết quả của lượt này, một lượt API 180 giây
// bắt đầu TRƯỚC nhưng về SAU một lượt cục bộ 5-15 giây có thể ghi đè ngược mất số Antigravity vừa
// mới cập nhật (codex soi ra 02/08). Tách hẳn 2 nguồn ở đây thì phía main.js không còn cách nào
// lẫn lộn được nữa, dù có merge kiểu gì.
const fetchAll = (disabled = []) => ask(active(disabled).filter((p) => !p.local))

// Chỉ nhóm cục bộ — dùng cho nhịp nhanh, không đụng tới Claude/Codex (tránh gọi API thừa).
const fetchLocal = (disabled = []) => ask(active(disabled).filter((p) => p.local))

module.exports = { ALL, catalog, fetchAll, fetchLocal }
