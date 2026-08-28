// Đọc TRANSCRIPT CỤC BỘ (~/.claude/projects/**/*.jsonl) để biết cửa sổ ngữ cảnh phiên gần nhất
// và vài số của hôm nay. Không gọi mạng, không tốn quota → nhịp nhanh (mặc định 8 giây).
//
// ⚠️ BÀI HỌC CŨ: ĐỪNG TỰ ĐOÁN ngưỡng token để tính % (bản Windows từng sai gấp 3 lần — báo 54,9%
// trong khi thật 15%). Trần ngữ cảnh ở đây lấy theo thứ tự: người dùng đặt trong Cài đặt → model tự
// khai `[1m]` → suy từ số token quan sát được. Chỗ nào chỉ là phỏng đoán thì PHẢI gắn cờ để giao
// diện nói rõ "ước tính" — xem `contextLimitFor` bên dưới.
const fs = require('fs')
const fsp = fs.promises
const os = require('os')
const path = require('path')

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')
// Claude Desktop/IDE không ghi vào ~/.claude/projects. Ứng dụng của Anthropic có bộ đếm ngày
// riêng, chỉ gồm công việc làm trong IDE; cộng nó vào tổng CLI để bảng “Hôm nay” không hụt.
const DESKTOP_TOKENS_FILE = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'buddy-tokens.json')
const TAIL_BYTES = 256 * 1024

function localDateKey(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

async function readDesktopTodayTokens(file = DESKTOP_TOKENS_FILE, today = localDateKey()) {
  try {
    const raw = JSON.parse(await fsp.readFile(file, 'utf8'))
    const entry = raw['tokens-today']
    const tokens = Number(entry?.tokens)
    // Không dùng số tồn từ hôm qua; cũng không tin số âm/chữ để tránh làm tổng token sai.
    return entry?.date === today && Number.isFinite(tokens) && tokens >= 0 ? Math.round(tokens) : 0
  } catch { return 0 }
}

// ★ TOÀN BỘ hàm đọc file trong module này là BẤT ĐỒNG BỘ (fs.promises), KHÔNG dùng *Sync — Electron
// chỉ có MỘT luồng chính lo cả vẽ giao diện lẫn chạy JS; đọc đồng bộ 1 file transcript vài MB đã
// đủ giật, mà `todayStats()` có thể quét tới 20 file cùng lúc (4MB/file × 20 = tới 80MB) mỗi khi
// nhiều phiên vừa đổi — đúng chỗ codex soi ra (cũng đã soi ở bản Windows 30/07). Dùng fs.promises
// để việc CHỜ ĐĨA không chặn vòng lặp sự kiện; các lệnh gọi song song còn được `Promise.all` gộp
// lại thay vì xếp hàng tuần tự.
async function listTranscripts() {
  const out = []
  let dirs = []
  try { dirs = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true }) } catch { return out }
  const dirScans = dirs.filter((d) => d.isDirectory()).map(async (d) => {
    const p = path.join(PROJECTS_DIR, d.name)
    let files = []
    try { files = await fsp.readdir(p) } catch { return [] }
    const jsonl = files.filter((f) => f.endsWith('.jsonl'))
    const stats = await Promise.all(jsonl.map(async (f) => {
      const full = path.join(p, f)
      try { return { file: full, mtime: (await fsp.stat(full)).mtimeMs } } catch { return null }
    }))
    return stats.filter(Boolean)
  })
  for (const list of await Promise.all(dirScans)) out.push(...list)
  return out.sort((a, b) => b.mtime - a.mtime)
}

// Đọc phần ĐUÔI file (file phiên có thể vài chục MB — không nạp cả file).
async function readTail(file, bytes = TAIL_BYTES) {
  let fh
  try {
    fh = await fsp.open(file, 'r')
    const size = (await fh.stat()).size
    const start = Math.max(0, size - bytes)
    const buf = Buffer.alloc(size - start)
    await fh.read(buf, 0, buf.length, start)
    return { text: buf.toString('utf8'), truncated: start > 0 }
  } catch { return { text: '', truncated: false } }
  finally { if (fh) try { await fh.close() } catch { /* bỏ qua */ } }
}

// Suy trần ngữ cảnh — KHÔNG có nguồn cục bộ nào ghi cửa sổ thật, nên đây là chỗ dễ sai nhất.
//
// ★★ ĐÃ ĐO CẠN 27/07 (đừng đi lại đường này): KHÔNG file nào trên máy biết phiên đang chạy 1M.
//   · `~/.claude/projects/**/*.jsonl` → `message.model` luôn là `claude-opus-5` TRẦN, không hậu tố.
//     Quét TOÀN BỘ transcript trên máy: 0 record nào có `[1m]` ở field model (chỉ có trong nội
//     dung chữ). ⇒ nhánh regex `[1m]` dưới đây HIỆN LÀ CODE CHẾT, giữ lại phòng khi Anthropic
//     đổi cách ghi, KHÔNG được coi là đường lấy dữ liệu chính.
//   · `~/.claude.json` → `clientDataCacheSlots[].model` cũng chỉ `claude-opus-5`.
//   · Tiến trình đang chạy: lệnh trần `claude`, không kèm `--model`.
//
// ★ Bằng chứng DUY NHẤT tự có: số token quan sát được là CẬN DƯỚI chắc chắn của cửa sổ thật →
//   vượt 200k thì không thể là cửa sổ 200k. Nhưng chiều ngược lại KHÔNG đúng: dưới 200k thì
//   KHÔNG chứng minh được gì cả — 1M mới dùng 80k trông y hệt 200k mới dùng 80k.
//   ⇒ Nấc 200k luôn chỉ là PHỎNG ĐOÁN, phải gắn nhãn "ước tính". Nấc 1M suy từ token là SỰ THẬT.
//   (Bản trước gắn cờ ngược chiều: khẳng định chắc chỗ đang đoán, rào trước chỗ đã có bằng chứng
//    → đầu phiên báo 200k như đinh đóng cột, thổi % ngữ cảnh lên gấp 5.)
const CONTEXT_TIERS = [200000, 1000000]
function contextLimitFor(model, tokens, override) {
  // 1. Người dùng chọn trong Cài đặt — nguồn duy nhất đúng 100%, thắng mọi phỏng đoán.
  const manual = Number(override)
  if (Number.isFinite(manual) && manual > 0) {
    // Token đã vượt trần đặt tay ⇒ cài đặt sai sự thật. Vẫn tôn trọng lựa chọn nhưng phải BÁO,
    // không im lặng kẹp % ở 100 rồi tạo cảm giác sai rằng ngữ cảnh sắp đầy.
    return { limit: manual, inferred: false, source: 'manual', overLimit: tokens > manual }
  }
  // 2. Model tự khai (hiện không bao giờ xảy ra — xem ghi chú trên).
  if (/\[1m\]/i.test(model || '')) return { limit: 1000000, inferred: false, source: 'model' }
  // 3. Suy từ token quan sát được.
  for (const tier of CONTEXT_TIERS) {
    if (tokens <= tier) {
      const proven = tokens > CONTEXT_TIERS[0]   // chỉ nấc trên 200k mới có bằng chứng cứng
      return { limit: tier, inferred: !proven, source: proven ? 'evidence' : 'guess' }
    }
  }
  // Vượt cả nấc lớn nhất đang biết → không bịa phần trăm.
  return { limit: null, inferred: false, source: 'unknown' }
}

// Cửa sổ ngữ cảnh = bản ghi usage CUỐI CÙNG: input + cache_read + cache_creation
// (KHÔNG cộng output — output không nằm trong ngữ cảnh đầu vào của lượt kế tiếp).
async function readContext(limitOverride) {
  const files = await listTranscripts()
  if (!files.length) return { available: false }

  const newest = files[0]
  const lines = (await readTail(newest.file)).text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i].trim()
    if (!ln || ln[0] !== '{') continue
    let obj
    try { obj = JSON.parse(ln) } catch { continue }
    const u = obj?.message?.usage
    if (!u) continue
    const tokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
    if (!tokens) continue
    const model = obj?.message?.model || null
    const { limit, inferred, source, overLimit } = contextLimitFor(model, tokens, limitOverride)
    return {
      available: true,
      tokens,
      model,
      limit,
      limitInferred: inferred,          // true = trần chỉ là PHỎNG ĐOÁN, chưa có bằng chứng
      limitSource: source,              // manual | model | evidence | guess | unknown
      overLimit: !!overLimit,           // token đã vượt trần đặt tay ⇒ cài đặt sai
      pct: limit ? Math.max(0, Math.min(100, (tokens / limit) * 100)) : null,
      at: newest.mtime,
      sessionFile: path.basename(newest.file),
    }
  }
  return { available: false }
}

// ---- Thống kê hôm nay + danh sách phiên (cho panel mở rộng) ---------------------------------
//
// ⚠️ Hàm này chạy theo nhịp cục bộ (8 giây) nên PHẢI rẻ. Cách giữ rẻ: nhớ kết quả theo `mtime` —
//    file nào không đổi thì không đọc lại lần nào nữa. Không có cache thì mỗi 8 giây lại nghiền
//    vài MB JSONL trên luồng chính của Electron → giật widget (đúng chỗ codex soi ra ở bản Windows).
const STAT_TAIL = 4 * 1024 * 1024
const statCache = new Map()   // path -> { mtime, day, tokens, messages, models, last }

// ★ Cache trước đây KHÔNG BAO GIỜ xoá mục cũ — mỗi file transcript từng chạm tới (mọi phiên, mọi
// ngày, mọi dự án dưới ~/.claude/projects) nằm lại vĩnh viễn, kể cả khi file đã bị xoá trên đĩa
// hoặc đã rớt khỏi "hôm nay"/"gần đây" (khoá cache gồm cả `day` nên qua nửa đêm là mục cũ chết
// hẳn nhưng vẫn giữ RAM). Widget chạy hàng tuần/tháng không tắt → tăng bộ nhớ theo thời gian
// (codex soi ra). `todayStats()` chỉ CẦN nhớ đúng các file đang thật sự dùng (tối đa 20 "hôm nay"
// + `maxSessions` "gần đây") — sau mỗi lần quét, dọn hết mục nào không còn trong 2 danh sách đó.
function pruneStatCache(keepFiles) {
  const keep = new Set(keepFiles)
  for (const file of statCache.keys()) if (!keep.has(file)) statCache.delete(file)
}

async function parseFile(file, mtime, dayStart) {
  const hit = statCache.get(file)
  if (hit && hit.mtime === mtime && hit.day === dayStart) return hit

  const { text, truncated } = await readTail(file, STAT_TAIL)
  const out = { mtime, day: dayStart, tokens: 0, messages: 0, models: new Map(), last: null, truncated }
  for (const ln of text.split('\n')) {
    const s = ln.trim()
    if (!s || s[0] !== '{') continue
    let obj
    try { obj = JSON.parse(s) } catch { continue }
    const u = obj?.message?.usage
    if (!u) continue
    const model = obj?.message?.model || null
    const ctxTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
    // Bản ghi CUỐI dùng để tính ngữ cảnh phiên (chỉ token đầu vào — output không nằm trong
    // ngữ cảnh của lượt kế tiếp). `cwd` cho tên dự án chính xác hơn là đoán từ tên thư mục.
    if (ctxTokens) out.last = { tokens: ctxTokens, model, cwd: obj.cwd || null }

    const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : mtime
    if (!Number.isFinite(ts) || ts < dayStart) continue
    // "Token hôm nay" là tổng công đã tiêu: vào + ra + cache. Khác với ngữ cảnh ở trên.
    const total = ctxTokens + (u.output_tokens || 0)
    out.tokens += total
    out.messages += 1
    if (model) out.models.set(model, (out.models.get(model) || 0) + total)
  }
  statCache.set(file, out)
  return out
}

function projectName(file, last) {
  if (last && last.cwd) return path.basename(last.cwd)
  return path.basename(path.dirname(file)).replace(/^-+/, '').split('-').pop() || '?'
}

async function todayStats(limitOverride, maxSessions = 5) {
  const files = await listTranscripts()
  const d = new Date(); d.setHours(0, 0, 0, 0)
  const dayStart = d.getTime()
  const now = Date.now()

  const todayFiles = files.filter((f) => f.mtime >= dayStart)
  let tokens = 0, messages = 0
  const models = new Map()
  // Chặn trên 20 file: một ngày làm việc dày cũng chỉ vài chục phiên, quét hết là phí.
  // Quét SONG SONG (Promise.all) — file nào đã có trong statCache trả về gần như tức thì, file nào
  // phải đọc lại thì đĩa xử lý đồng thời thay vì xếp hàng chờ từng cái một.
  const todaySlice = todayFiles.slice(0, 20)
  const todayParsed = await Promise.all(todaySlice.map((f) => parseFile(f.file, f.mtime, dayStart)))
  // ★ Tổng "hôm nay" có thể THIẾU mà giao diện lại khẳng định như số đầy đủ (codex soi ra 02/08):
  //   (1) mỗi transcript chỉ đọc 4MB CUỐI (`STAT_TAIL`) — phiên dài hơn thế bị cắt đầu, và
  //   (2) chỉ 20 file mới nhất được cộng dù `sessionsToday` đếm TOÀN BỘ file trong ngày.
  //   Gắn cờ `partial` khi 1 trong 2 điều đó xảy ra, để renderer hiện "≥ …"/"chưa đầy đủ" thay vì
  //   một con số trông chắc chắn nhưng thực ra thấp hơn thật.
  let filesTruncated = false
  for (const st of todayParsed) {
    tokens += st.tokens
    messages += st.messages
    if (st.truncated) filesTruncated = true
    for (const [m, t] of st.models) models.set(m, (models.get(m) || 0) + t)
  }
  const partial = filesTruncated || todayFiles.length > todaySlice.length
  const desktopTokens = await readDesktopTodayTokens()

  const sessionFiles = files.slice(0, maxSessions)
  const sessionParsed = await Promise.all(sessionFiles.map((f) => parseFile(f.file, f.mtime, dayStart)))
  // Chỉ 2 danh sách trên còn dùng tới cache — dọn hết phần còn lại (xem ghi chú ở pruneStatCache).
  pruneStatCache([...todaySlice, ...sessionFiles].map((f) => f.file))
  const sessions = sessionFiles.map((f, i) => {
    const st = sessionParsed[i]
    const tk = st.last ? st.last.tokens : 0
    // Cùng cờ inferred/source/overLimit như `readContext` — nếu không truyền ra, panel "Phiên gần
    // đây" sẽ hiện trần 200k phỏng đoán như số chắc chắn (đúng bẫy đã vấp 27/07, xem ghi chú trên).
    const { limit, inferred, source, overLimit } = contextLimitFor(st.last && st.last.model, tk, limitOverride)
    return {
      project: projectName(f.file, st.last),
      ageMinutes: Math.max(0, Math.round((now - f.mtime) / 60000)),
      tokens: tk,
      pct: limit ? Math.min(100, (tk / limit) * 100) : null,
      limitInferred: inferred,
      limitSource: source,
      overLimit: !!overLimit,
    }
  })

  return {
    sessionsToday: todayFiles.length,
    sessionsCounted: todaySlice.length,   // số file THẬT SỰ được cộng vào tokens/messages bên dưới
    totalSessions: files.length,
    tokens: tokens + desktopTokens, messages,
    desktopTokens,
    partial,   // true = tokens/messages là CẬN DƯỚI, không phải tổng đầy đủ (xem ghi chú ở trên)
    models: [...models].map(([model, t]) => ({ model, tokens: t })).sort((a, b) => b.tokens - a.tokens),
    sessions,
  }
}

// `contextLimitFor` xuất ra để test/context-limit.js kiểm được từng nhánh mà không cần Electron.
module.exports = { readContext, todayStats, contextLimitFor, CONTEXT_TIERS, _readDesktopTodayTokens: readDesktopTodayTokens, _localDateKey: localDateKey }
