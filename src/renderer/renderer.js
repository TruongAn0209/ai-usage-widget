// Dựng DOM theo dữ liệu main gửi sang. 5 bố cục dùng CHUNG một danh sách hạn mức đã gom sẵn
// (`collect`), nên thêm/sửa nguồn số chỉ phải sửa một chỗ.
//
// QUY ƯỚC: mọi mục là "% ĐÃ DÙNG", tăng dần. Chú thích cũng cùng chiều — ghi
//   "đã dùng X / Y", TUYỆT ĐỐI không ghi "còn lại" (số còn lại giảm ngược chiều thanh → rối).
// ★ CSP ở đây là `style-src 'self'` (không có unsafe-inline) ⇒ KHÔNG được dựng HTML bằng chuỗi
//   có thuộc tính style="". Đặt kích thước/màu qua CSSOM (el.style.x) hoặc qua lớp CSS.
const $ = (id) => document.getElementById(id)
const nf = new Intl.NumberFormat('vi-VN')
const SVG_NS = 'http://www.w3.org/2000/svg'

// Câu chữ ở đây phải TRUNG TÍNH tên hãng — chỗ hiện lỗi luôn có sẵn tiền tố "TênAI: ", ghi cứng
// chữ "Claude" là ra câu vô lý kiểu "Codex: chưa tìm thấy đăng nhập Claude".
const ERRORS = {
  NO_CREDENTIALS: 'Chưa tìm thấy đăng nhập trên máy này.',
  NO_TOKEN: 'Đăng nhập thiếu token.',
  EXPIRED: 'Token đã hết hạn — mở lại CLI để đăng nhập.',
  UNAUTHORIZED: 'Token bị từ chối — mở lại CLI để đăng nhập.',
  RATE_LIMITED: 'Bị giới hạn tần suất, sẽ thử lại.',
  TIMEOUT: 'Mạng chậm/không nối được.',
  NETWORK: 'Không nối được mạng.',
  NO_QUOTA_API: 'Hãng không công bố API hạn mức.',
  NO_API_KEY: 'Chưa có OPENROUTER_API_KEY trên máy này.',
  LOADING: 'Đang đọc…',
  NOT_RUNNING: 'agy đang tắt.',
  UNSUPPORTED_OS: 'Chỉ hỗ trợ macOS.',
  GROK_BILLING_BLOCKED: 'Grok chặn truy cập billing — mở Grok CLI để kiểm tra.',
}
const errText = (code) => ERRORS[code] || ('Lỗi: ' + (code || 'không rõ'))

function levelClass(pct) {
  if (pct == null) return ''
  if (pct >= 95) return 'crit'
  if (pct >= 80) return 'warn'
  return ''
}
const hasPct = (m) => m.pct != null && Number.isFinite(Number(m.pct))
const pctText = (m) => (hasPct(m) ? m.pct.toFixed(0) + '%' : '—')
const pctWidth = (m) => (hasPct(m) ? Math.max(0, Math.min(100, m.pct)) : 0)

// Lớp màu của một mục: dưới ngưỡng cảnh báo thì giữ màu riêng (ctx xanh / scoped cam), từ ngưỡng
// trở lên LUÔN nhường cho warn/crit. Bản Windows từng bỏ qua ngưỡng ở các mục có màu riêng →
// mục 99% vẫn hiện màu bình thường trong khi mục khác đỏ rực, nhìn nghịch nhau.
function toneOf(m) {
  const lv = levelClass(m.pct)
  return lv || m.kind || (hasPct(m) ? 'ok' : 'scoped')
}

function resetText(resetAt) {
  if (!resetAt) return ''
  const ms = resetAt - Date.now()
  if (ms <= 0) return 'đang làm mới'
  // Làm tròn ra TỔNG SỐ PHÚT rồi mới tách giờ/phút. Tách trước rồi mới làm tròn thì phút có thể
  // thành 60 → hiện "còn 1h60" thay vì "còn 2h00" (test khói bắt được 27/07).
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60), m = totalMin % 60
  return h > 0 ? `còn ${h}h${String(m).padStart(2, '0')}` : `còn ${m} phút`
}

// ★ "Đã cập nhật" phải theo giờ LẤY ĐƯỢC DỮ LIỆU thật (main.js gắn `fetchedAt` mỗi khi fetch
//   thành công), KHÔNG phải giờ vẽ lại màn hình. Renderer tự vẽ lại mỗi 30 giây để chạy đếm ngược
//   (xem `setInterval` cuối file) — bản cũ gán `updated` bằng `new Date()` ngay tại đó, nên mạng lỗi
//   hay API chưa chạy lại thì chân widget vẫn trông như vừa lấy số mới (codex soi ra 02/08).
function latestFetchedAt(providers) {
  let max = null
  for (const p of providers || []) {
    if (p.fetchedAt && !p.stale) max = max ? Math.max(max, p.fetchedAt) : p.fetchedAt
  }
  return max
}
function relTime(ms) {
  if (!ms) return '—'
  const diffMin = Math.round((Date.now() - ms) / 60000)
  if (diffMin <= 0) return 'vừa xong'
  if (diffMin < 60) return `${diffMin} phút trước`
  return `${Math.floor(diffMin / 60)} giờ trước`
}

function fmtTokens(n) {
  if (!Number.isFinite(Number(n))) return '0'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}

// Chú thích ngữ cảnh phải NÓI RÕ mức chắc chắn của cái trần đang dùng.
// Trần 200k khi phiên mới dùng ít token CHỈ LÀ PHỎNG ĐOÁN (1M dùng 80k trông y hệt 200k dùng 80k)
// → phải có dấu ≈ và chữ "ước tính", nếu không người dùng có thể tin nhầm con số sai gấp 5.
function contextNote(ctx) {
  const used = `đã dùng ${nf.format(ctx.tokens)}`
  if (ctx.limitSource === 'guess') return `${used} / ≈${nf.format(ctx.limit)} (ước tính — đặt trần trong Cài đặt)`
  if (ctx.limitSource === 'manual') {
    return ctx.overLimit
      ? `${used} / ${nf.format(ctx.limit)} ⚠ đã vượt trần đặt tay — sửa trong Cài đặt`
      : `${used} / ${nf.format(ctx.limit)} (đặt tay)`
  }
  return `${used} / ${nf.format(ctx.limit)}`   // model tự khai, hoặc suy từ bằng chứng token → chắc
}

// Dự báo lúc chạm 100%, main đo bằng hồi quy trên lịch sử % (src/forecast.js).
// Chỉ có mục nào đo được TỐC ĐỘ THẬT mới có; không có thì không hiện gì — không doạ hão.
function forecastNote(fc, key) {
  const f = fc && fc[key]
  if (!f || !f.etaMs) return ''
  const d = new Date(f.etaMs)
  return ` · hết ~${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ---- Gom mọi hạn mức thành MỘT danh sách chung cho cả 5 bố cục -----------------------
// Nhiều AI → mỗi AI một `group` để bố cục chèn nhãn tên AI phân tách. Một AI → group = null,
// không chèn nhãn gì (giữ gọn như bản cũ).
function collect(data) {
  const list = []
  let providers = data.providers || []
  // Thứ tự tự sắp trong Cài đặt — id không có trong danh sách thì xếp cuối, giữ
  // nguyên thứ tự main.js gửi sang (ổn định, không nhảy lung tung mỗi lần render).
  const order = data.config.providerOrder
  if (Array.isArray(order) && order.length) {
    const rank = new Map(order.map((id, i) => [id, i]))
    providers = providers
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (rank.has(a.p.id) ? rank.get(a.p.id) : 999 + a.i) - (rank.has(b.p.id) ? rank.get(b.p.id) : 999 + b.i))
      .map((x) => x.p)
  }
  const multi = providers.filter((p) => p.ok).length > 1
  const fc = data.config.showForecast === false ? null : data.forecasts

  for (const p of providers) {
    if (!p.ok) continue            // lỗi đã hiện ở dòng trạng thái, không chiếm chỗ ở đây
    // "Chỉ hiện mục cao nhất" (mục 12) — gọn khi 1 AI có nhiều hạn mức con (Opus/Sonnet/tuần…).
    // Riêng Claude và GPT Plus luôn ghim cả hai cửa sổ tài khoản 5 giờ + Tuần. Mục model riêng có
    // thể là cao nhất, nhưng không được che mất hạn mức tổng. So bằng key ổn định từ
    // provider, không phụ thuộc nhãn có thể thay đổi theo backend.
    let metrics = p.metrics || []
    if (data.config.topMetricOnly && metrics.length > 1) {
      let top = metrics[0]
      for (const m of metrics) if (m.pct != null && (top.pct == null || m.pct > top.pct)) top = m
      metrics = [top]
      const pinnedKeys = p.id === 'claude'
        ? ['5h', '7d']
        : (p.id === 'codex' ? ['primary', 'secondary'] : [])
      for (const key of pinnedKeys) {
        const metric = p.metrics.find((m) => m.key === key)
        if (metric && !metrics.some((m) => m.key === metric.key)) metrics.push(metric)
      }
    }
    for (const m of metrics) {
      const key = p.id + '|' + m.key
      list.push({
        key,
        group: multi ? p.name : null,
        label: m.label,
        pct: m.pct,
        kind: m.scoped ? 'scoped' : '',
        note: (m.info || resetText(m.resetAt)) + forecastNote(fc, key),
      })
    }
  }

  // Ngữ cảnh phiên đang mở — số CỤC BỘ, không phải hạn mức tài khoản → tách bằng đường kẻ.
  const ctx = data.context
  if (data.config.showContext && ctx && ctx.available && ctx.pct != null) {
    list.push({
      key: 'ctx', group: multi ? 'Phiên này' : null, label: 'Ngữ cảnh phiên',
      pct: ctx.pct, kind: 'ctx', note: contextNote(ctx), sepBefore: !multi,
    })
  }
  return list
}

// ---- Bố cục 1: Thanh ngang (mặc định) ------------------------------------------------
function layoutBars(items) {
  const frag = document.createDocumentFragment()
  for (const m of items) {
    if (m.sepBefore) frag.append(Object.assign(document.createElement('div'), { className: 'sep' }))
    const row = document.createElement('div'); row.className = 'row'
    const head = document.createElement('div'); head.className = 'head'
    const lb = document.createElement('span'); lb.className = 'label'; lb.textContent = m.label; lb.title = m.label
    const pc = document.createElement('span'); pc.className = 'pct ' + toneOf(m); pc.textContent = pctText(m)
    head.append(lb, pc)
    const bar = document.createElement('div'); bar.className = 'bar'
    const fill = document.createElement('i')
    fill.className = toneOf(m)
    fill.style.width = (hasPct(m) ? Math.max(2, pctWidth(m)) : 0) + '%'
    bar.append(fill)
    row.append(head, bar)
    if (m.note) {
      const n = document.createElement('div'); n.className = 'note'; n.textContent = m.note; n.title = m.note
      row.append(n)
    }
    frag.append(row)
  }
  return frag
}

// ---- Bố cục 2: Vòng tròn --------------------------------------------------------------
function layoutRings(items) {
  const wrap = document.createElement('div'); wrap.className = 'rings'
  for (const m of items) {
    const tone = toneOf(m)
    const box = document.createElement('div'); box.className = 'ring'
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('width', '56'); svg.setAttribute('height', '56'); svg.setAttribute('viewBox', '0 0 42 42')
    const mk = (cls) => {
      const c = document.createElementNS(SVG_NS, 'circle')
      c.setAttribute('cx', '21'); c.setAttribute('cy', '21'); c.setAttribute('r', '16')
      c.setAttribute('stroke-width', '5'); c.setAttribute('class', cls)
      return c
    }
    const track = mk('ring-track'); track.setAttribute('fill', 'none')
    const arc = mk('ring-arc ' + tone)
    arc.setAttribute('pathLength', '100')
    arc.setAttribute('stroke-dasharray', `${pctWidth(m)} 100`)
    arc.setAttribute('stroke-linecap', 'round')
    arc.setAttribute('transform', 'rotate(-90 21 21)')
    const txt = document.createElementNS(SVG_NS, 'text')
    txt.setAttribute('x', '21'); txt.setAttribute('y', '24'); txt.setAttribute('text-anchor', 'middle')
    txt.setAttribute('class', 'ring-num ' + tone)
    txt.textContent = pctText(m)
    svg.append(track, arc, txt)
    const cap = document.createElement('div'); cap.className = 'ring-cap'
    cap.textContent = m.label; cap.title = m.note ? `${m.label} — ${m.note}` : m.label
    box.append(svg, cap)
    wrap.append(box)
  }
  return wrap
}

// ---- Bố cục 3: Dải siêu gọn ------------------------------------------------------------
function layoutStrip(items) {
  const wrap = document.createElement('div'); wrap.className = 'strip'
  for (const m of items) {
    const tone = toneOf(m)
    const it = document.createElement('div'); it.className = 'strip-item'; it.title = `${m.label} ${pctText(m)}`
    const tag = document.createElement('span'); tag.className = 'strip-tag'; tag.textContent = m.label
    const track = document.createElement('div'); track.className = 'strip-track'
    const fill = document.createElement('div'); fill.className = 'strip-fill ' + tone
    fill.style.width = pctWidth(m) + '%'
    track.append(fill)
    const pc = document.createElement('span'); pc.className = 'strip-pct ' + tone
    pc.textContent = hasPct(m) ? String(Math.round(m.pct)) : '—'
    it.append(tag, track, pc)
    wrap.append(it)
  }
  return wrap
}

// ---- Bố cục 5: Terminal ----------------------------------------------------------------
// CHỈ vẽ các dòng số; dòng nhắc "$ ai --usage" do LAYOUTS.terminal thêm ĐÚNG 1 LẦN ở ngoài —
// bản Windows từng để hàm này tự chèn nên mỗi nhóm AI lại lặp lại dòng nhắc (5 dòng trên 1 màn).
function layoutTerminalLines(items) {
  const frag = document.createDocumentFragment()
  const W = 10
  for (const m of items) {
    const tone = toneOf(m)
    const line = document.createElement('div'); line.className = 'term-line'
    const key = document.createElement('span'); key.className = 'term-key'
    key.textContent = m.label; key.title = m.note ? `${m.label} — ${m.note}` : m.label
    const filled = Math.round((pctWidth(m) / 100) * W)
    const bar = document.createElement('span'); bar.className = 'term-bar ' + tone
    bar.textContent = '[' + '█'.repeat(filled) + '░'.repeat(W - filled) + ']'
    const pc = document.createElement('span'); pc.className = 'term-pct ' + tone; pc.textContent = pctText(m)
    line.append(key, bar, pc)
    frag.append(line)
  }
  return frag
}

// Chèn nhãn tên AI khi có >=2 nhóm có tên; 1 nhóm thì giữ nguyên, không chèn gì.
function withGroups(items, build) {
  const groups = []
  for (const m of items) {
    const k = m.group || null
    if (!groups.length || groups[groups.length - 1].key !== k) groups.push({ key: k, items: [] })
    groups[groups.length - 1].items.push(m)
  }
  if (groups.filter((g) => g.key).length <= 1) return build(items)
  const frag = document.createDocumentFragment()
  for (const g of groups) {
    if (g.key) {
      const h = document.createElement('div'); h.className = 'group-head'; h.textContent = g.key
      frag.append(h)
    }
    frag.append(build(g.items))
  }
  return frag
}

// ---- Bố cục 4: Bảng lớn (2 cột: hạn mức | hôm nay) ---------------------------------------
function layoutDashboard(items, data) {
  const dash = document.createElement('div'); dash.className = 'dash'
  const left = document.createElement('div'); left.className = 'dash-col'
  left.append(withGroups(items, layoutBars))
  const right = document.createElement('div'); right.className = 'dash-col'
  right.append(todaySection(data))
  dash.append(left, right)
  return dash
}

const LAYOUTS = {
  bars: (i) => withGroups(i, layoutBars),
  rings: (i) => withGroups(i, layoutRings),
  strip: (i) => withGroups(i, layoutStrip),
  terminal: (i) => {
    const box = document.createElement('div'); box.className = 'term'
    const p = document.createElement('div'); p.className = 'term-prompt'; p.textContent = '$ ai --usage'
    box.append(p, withGroups(i, layoutTerminalLines))
    return box
  },
  dashboard: (i, data) => layoutDashboard(i, data),
}

// ---- Panel mở rộng --------------------------------------------------------------------
function statLine(k, v) {
  const row = document.createElement('div'); row.className = 'stat-line'
  const a = document.createElement('span'); a.textContent = k
  const b = document.createElement('b'); b.textContent = v
  row.append(a, b)
  return row
}
function sectionTitle(t) {
  const el = document.createElement('div'); el.className = 'section-title'; el.textContent = t
  return el
}

function todaySection(data) {
  const t = data.today || {}
  const frag = document.createDocumentFragment()
  // ★ `partial` = mỗi transcript chỉ đọc 4MB cuối và chỉ 20 file mới nhất được cộng — ngày làm
  //   việc dài có thể báo THẤP HƠN thật mà không nói gì (codex soi ra 02/08). Ghi rõ "≥"/"chưa đầy
  //   đủ" thay vì trình bày như một tổng chắc chắn.
  frag.append(sectionTitle(t.partial ? 'Hôm nay (chưa đầy đủ)' : 'Hôm nay'))
  const ge = t.partial ? '≥ ' : ''
  // Ghi rõ nguồn: CLI có cache_read, còn Claude Desktop có bộ đếm ngày riêng. Để trần chữ
  // “Token” thì dễ tưởng đây là đúng một loại số hay chỉ một nơi làm việc.
  const desktopNote = t.desktopTokens > 0 ? ' + IDE' : ''
  frag.append(statLine('Token (CLI gồm cache' + desktopNote + ')', ge + fmtTokens(t.tokens || 0)))
  frag.append(statLine('Lượt hỏi', ge + String(t.messages || 0)))
  const sessionsCounted = t.sessionsCounted
  const sessLabel = Number.isFinite(sessionsCounted) && sessionsCounted < (t.sessionsToday || 0)
    ? `${t.sessionsToday || 0} / ${t.totalSessions || 0} (đã cộng ${sessionsCounted})`
    : `${t.sessionsToday || 0} / ${t.totalSessions || 0}`
  frag.append(statLine('Phiên', sessLabel))
  for (const m of (t.models || []).slice(0, 4)) {
    const row = document.createElement('div'); row.className = 'model-row'
    const a = document.createElement('span'); a.textContent = String(m.model || '?').replace('claude-', '')
    const b = document.createElement('span'); b.textContent = fmtTokens(m.tokens)
    row.append(a, b); frag.append(row)
  }
  return frag
}

function buildPanel(data) {
  const frag = document.createDocumentFragment()
  const sessions = (data.today && data.today.sessions) || []
  if (sessions.length) {
    frag.append(sectionTitle('Phiên gần đây'))
    for (const [i, s] of sessions.entries()) {
      const row = document.createElement('div'); row.className = 'session-row' + (i === 0 ? ' active' : '')
      const p = document.createElement('span'); p.className = 'sess-proj'; p.textContent = s.project; p.title = s.project
      const a = document.createElement('span'); a.className = 'sess-age'
      a.textContent = s.ageMinutes <= 0 ? 'vừa xong' : s.ageMinutes < 60 ? s.ageMinutes + 'p' : Math.round(s.ageMinutes / 60) + 'h'
      const c = document.createElement('span'); c.className = 'sess-ctx'
      // Trần 200k khi phiên mới dùng ít token chỉ là PHỎNG ĐOÁN (xem contextNote ở trên) — panel
      // này KHÔNG được đi qua contextNote nên phải tự đánh dấu ≈ + tooltip, không thì hiện số chắc
      // chắn giả (đúng bẫy đã vấp 27/07: trần đoán mò thổi % lên gấp 5).
      if (s.pct == null) {
        c.textContent = '—'
      } else {
        const approx = s.limitSource === 'guess'
        c.textContent = (approx ? '≈' : '') + Math.round(s.pct) + '%'
        c.classList.toggle('sess-ctx-approx', approx)
        if (approx) c.title = 'Trần ngữ cảnh là ước tính (chưa xác nhận) — đặt tay trong Cài đặt để chắc'
        else if (s.overLimit) c.title = '⚠ đã vượt trần đặt tay trong Cài đặt'
      }
      row.append(p, a, c); frag.append(row)
    }
  }
  frag.append(todaySection(data))
  return frag
}

// ---- Vẽ --------------------------------------------------------------------------------
let latest = null
let expanded = false

function render(data) {
  latest = data
  const cfg = data.config || {}
  document.body.dataset.palette = cfg.palette || 'nna'
  const layout = LAYOUTS[cfg.layout] ? cfg.layout : 'bars'
  document.body.dataset.layout = layout
  document.body.classList.toggle('compact', !!cfg.compact)
  // Đặt qua biến CSS (không gán thẳng style.opacity) để luật :hover trong style.css còn đè lên được.
  document.documentElement.style.setProperty('--op', String(cfg.opacity ?? 0.95))
  document.body.dataset.hoverBoost = cfg.hoverBoost === false ? '0' : '1'

  const providers = data.providers || []
  const okList = providers.filter((p) => p.ok)
  const badList = providers.filter((p) => !p.ok)

  // ★ Tiêu đề PHẢI trung tính khi có ≥2 AI — app đã hỗ trợ Claude/Codex/Antigravity, ghi cứng
  //   "Claude" làm sản phẩm trông như Claude-only dù đang hiện AI khác (codex soi ra 02/08).
  //   1 AI thì vẫn nêu đúng tên AI đó cho gọn (khớp cách `plan` hiện gói của đúng AI ấy).
  $('titleText').textContent = providers.length > 1 ? 'AI Usage' : (providers[0] ? providers[0].name : 'AI Usage')

  // Dòng trạng thái. Một AI → nhét gọn vào thanh tiêu đề. Nhiều AI → xuống dòng riêng bên dưới,
  // vì thanh tiêu đề chỉ đủ chỗ cho một cái tên (hai cái là bị cắt thành "CLAUDE · MAX COD…").
  // `p.stale` (main.js gắn khi mạng lỗi nhưng còn số cũ) vẫn tính là `ok`, nên phải tự thêm dấu ⚠
  // ở đây — không thì AI đang hiện số CŨ trông y hệt AI vừa lấy số MỚI.
  const plan = $('plan'), status = $('status')
  const tip = badList.map((p) => `${p.name}: ${errText(p.error)}`).join('\n')
  if (providers.length > 1) {
    plan.textContent = ''
    status.textContent = providers.map((p) => (p.ok
      ? p.name + (p.plan ? ' · ' + p.plan : '') + (p.stale ? ' ⚠' : '')
      : '⚠ ' + p.name)).join('   ')
    status.style.display = ''
  } else {
    plan.textContent = okList.length ? (okList[0].plan || '') + (okList[0].stale ? ' ⚠ mất mạng' : '') : ''
    status.textContent = ''
    status.style.display = 'none'
  }
  plan.classList.toggle('warn', badList.length > 0)
  status.classList.toggle('warn', badList.length > 0)
  plan.title = status.title = tip

  // Phần chính
  const body = $('body'); body.textContent = ''
  const items = collect(data)
  if (!items.length) {
    const msg = document.createElement('div'); msg.className = 'msg'
    msg.textContent = badList.length
      ? `${badList[0].name}: ${errText(badList[0].error)}`
      : 'Chưa đọc được hạn mức nào.'
    body.append(msg)
  } else {
    body.append(LAYOUTS[layout](items, data))
  }

  // AI đang lỗi vẫn phải nói RA (đừng để biến mất im lặng như thể chưa từng có).
  for (const p of badList) {
    const msg = document.createElement('div'); msg.className = 'msg'
    msg.textContent = `${p.name}: ${errText(p.error)}`
    body.append(msg)
  }

  // Dải siêu gọn thì bỏ hết phần phụ cho thật gọn.
  const slim = layout === 'strip'
  $('expand').style.display = slim ? 'none' : ''
  $('panel').style.display = slim || !expanded ? 'none' : 'block'
  $('foot').style.display = slim ? 'none' : ''
  if (!slim && expanded) { const p = $('panel'); p.textContent = ''; p.append(buildPanel(data)) }

  const fa = latestFetchedAt(providers)
  $('updated').textContent = relTime(fa)
  $('updated').title = fa ? new Date(fa).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''
  $('sessions').textContent = data.today ? `${data.today.sessionsToday} phiên hôm nay` : ''

  // Tự đo chiều cao rồi báo về main để cửa sổ khít nội dung (không thừa, không cắt).
  requestAnimationFrame(() => {
    window.api.reportHeight($('card').getBoundingClientRect().height + 2)
  })
}

window.api.onData(render)

// Đếm ngược "còn 1h20" phải tự chạy dù chưa có dữ liệu mới (nhịp API tới 180 giây).
setInterval(() => { if (latest) render(latest) }, 30000)

// Nút trên thanh tiêu đề (CSP chặn onclick inline → phải gắn ở đây).
$('btn-settings').addEventListener('click', () => window.api.openSettings())
// ★ Nút ⟳ trước đây quay đúng 0,6 giây bất kể request mất bao lâu (có lượt API tới 15-20 giây) —
//   quay xong sớm thì trông như đã lấy được số mới trong khi vẫn còn đang tải, quay dừng lại thì
//   không biết đã xong hay app treo (codex soi ra 02/08). Giờ bám ĐÚNG theo Promise của
//   `refresh-now`: quay suốt lúc chờ, chặn bấm lặp trong lúc đang chạy, xong thì có dấu ✓/✗ chớp
//   nhanh rồi tắt.
$('btn-refresh').addEventListener('click', async (e) => {
  const b = e.currentTarget
  if (b.disabled) return
  b.disabled = true
  b.classList.remove('spin', 'flash-ok', 'flash-partial', 'flash-err'); void b.offsetWidth; b.classList.add('spin')
  let status = 'failure'
  try {
    const result = await window.api.refreshNow()
    status = result && ['success', 'partial', 'failure'].includes(result.status)
      ? result.status
      : (result && result.ok ? 'success' : 'failure')
  } catch { status = 'failure' }
  b.classList.remove('spin')
  b.classList.add(status === 'success' ? 'flash-ok' : status === 'partial' ? 'flash-partial' : 'flash-err')
  b.title = status === 'success' ? 'Làm mới thành công' : status === 'partial' ? 'Làm mới một phần' : 'Làm mới thất bại'
  setTimeout(() => { b.classList.remove('flash-ok', 'flash-partial', 'flash-err'); b.disabled = false }, 700)
})
$('expand').addEventListener('click', () => {
  expanded = !expanded
  $('expand').textContent = expanded ? '▴' : '▾'
  $('expand').setAttribute('aria-expanded', String(expanded))
  if (latest) render(latest)
})
