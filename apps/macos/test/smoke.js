// Kiểm thử khói: nạp THẬT 2 trang giao diện bằng Electron, bơm dữ liệu giả, rồi soi DOM.
// Mục đích: bắt lỗi CSP / lỗi JS renderer / thiếu phần tử cài đặt — những thứ `node --check`
// KHÔNG bao giờ thấy (bài học cũ: `node -c` qua nhưng thiếu require là nổ lúc chạy).
//   chạy: npx electron test/smoke.js
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

const R = path.join(__dirname, '..', 'src', 'renderer')
// mục 15: widget và Cài đặt giờ dùng 2 preload RIÊNG (widget chỉ đọc, Cài đặt mới có quyền ghi).
const PRELOAD_WIDGET = path.join(__dirname, '..', 'src', 'preload-widget.js')
const PRELOAD_SETTINGS = path.join(__dirname, '..', 'src', 'preload-settings.js')
const errors = []
const results = []
let heightReported = null

ipcMain.on('content-height', (_e, h) => { heightReported = h })
ipcMain.handle('get-config', () => ({
  palette: 'espresso', layout: 'bars', compact: false, opacity: 0.95, width: 260,
  showContext: true, contextLimit: 'auto', showForecast: true, disabledProviders: [],
  alertsEnabled: true, alertWarnPct: 80, alertCritPct: 95,
  followClaudeCli: false,
  hotkey: 'Control+Alt+U', refreshApiMs: 180000, refreshLocalMs: 8000,
}))
ipcMain.handle('get-providers', () => ([
  { id: 'claude', name: 'Claude', available: true, enabled: true },
  { id: 'codex', name: 'Codex', available: true, enabled: true },
]))
// Bắt chước ĐÚNG main.js: Electron NÉM LỖI khi phím tắt sai cú pháp (đã đo: '###' ném lỗi,
// 'Control+Alt+U' trả true) → phải bọc try/catch và trả hotkeyOk=false, không được nuốt im.
ipcMain.handle('set-config', (_e, patch) => {
  results.push(['set-config nhận được', JSON.stringify(patch)])
  let hotkeyOk
  if (patch.hotkey !== undefined) {
    try { hotkeyOk = require('electron').globalShortcut.register(patch.hotkey, () => {}) } catch { hotkeyOk = false }
  }
  return { hotkeyOk }
})
ipcMain.handle('reset-config', () => ({}))
ipcMain.handle('refresh-now', () => { results.push(['nút ⟳ gọi làm-mới', '✅ main nhận được']) })
ipcMain.on('open-settings', () => { results.push(['nút ⚙ gọi mở-cài-đặt', '✅ main nhận được']) })

function watch(win, tag) {
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(`[${tag}] ${message}`)
  })
  win.webContents.on('preload-error', (_e, _p, err) => errors.push(`[${tag}] preload: ${err}`))
}

const FAKE = {
  providers: [{
    id: 'claude', name: 'Claude', ok: true, plan: 'max',
    metrics: [
      { key: '5h', label: '5 giờ', pct: 31.4, resetAt: Date.now() + 2 * 3600000 },
      { key: '7d', label: 'Tuần', pct: 87.2, resetAt: Date.now() + 40 * 3600000 },
      { key: 'm:Opus', label: 'Opus · tuần', pct: 96.5, resetAt: Date.now() + 40 * 3600000, scoped: true },
    ],
  }],
  context: { available: true, tokens: 291872, limit: 1000000, limitInferred: false, limitSource: 'evidence', pct: 29.2 },
  today: {
    sessionsToday: 3, totalSessions: 31, tokens: 8183215, messages: 65,
    models: [{ model: 'claude-opus-5', tokens: 8183215 }],
    sessions: [{ project: 'sample-project', ageMinutes: 0, tokens: 175166, pct: 17.5 }],
  },
  forecasts: { 'claude|7d': { etaMs: Date.now() + 3 * 3600000, ratePerHour: 4.2 } },
  config: { palette: 'espresso', layout: 'bars', opacity: 0.35, hoverBoost: true, showContext: true, showForecast: true },
}

// Hai AI cùng lúc: phải mọc nhãn nhóm tên AI, KHÔNG được trộn hạn mức vào nhau.
const FAKE_MULTI = {
  ...FAKE,
  providers: [
    FAKE.providers[0],
    { id: 'codex', name: 'GPT Plus', ok: true, plan: 'plus',
      metrics: [
        { key: 'primary', label: '5 giờ', pct: 7, resetAt: Date.now() + 3 * 3600000 },
        { key: 'secondary', label: 'Tuần', pct: 11, resetAt: Date.now() + 100 * 3600000 },
      ] },
    { id: 'gemini', name: 'Gemini', ok: false, error: 'NO_CREDENTIALS', metrics: [] },
  ],
}

app.whenReady().then(async () => {
  // ---- 1. Trang widget ---------------------------------------------------------
  const w = new BrowserWindow({ show: false, width: 260, height: 300, webPreferences: { preload: PRELOAD_WIDGET, contextIsolation: true, sandbox: true } })
  watch(w, 'widget')
  await w.loadFile(path.join(R, 'index.html'))
  w.webContents.send('usage-data', FAKE)
  await new Promise((r) => setTimeout(r, 700))

  const dom = await w.webContents.executeJavaScript(`(() => ({
    rows: [...document.querySelectorAll('.row')].map(r => ({
      label: r.querySelector('.label').textContent,
      pct: r.querySelector('.pct').textContent,
      cls: r.querySelector('.bar > i').className,
      note: r.querySelector('.note')?.textContent || ''
    })),
    palette: document.body.dataset.palette,
    plan: document.getElementById('plan').textContent,
    hasSep: !!document.querySelector('.sep'),
    // màu nền thật sự áp được từ themes.css chưa
    surface: getComputedStyle(document.getElementById('card')).backgroundColor,
    // độ trong: biến --op phải xuống tới card, và luật :hover phải còn đè lên được
    opVar: getComputedStyle(document.documentElement).getPropertyValue('--op').trim(),
    cardOpacity: getComputedStyle(document.getElementById('card')).opacity,
    hoverAttr: document.body.dataset.hoverBoost
  }))()`)

  results.push(['số hàng dựng được', dom.rows.length])
  for (const r of dom.rows) results.push([`  · ${r.label}`, `${r.pct} · lớp="${r.cls}" · ${r.note}`])
  results.push(['bảng màu áp dụng', `${dom.palette} → nền ${dom.surface}`])
  results.push(['độ trong áp xuống card', `--op=${dom.opVar} → opacity thật ${dom.cardOpacity}` +
    (dom.cardOpacity === '0.35' ? ' ✅' : ' ❌ KHÔNG khớp')])
  results.push(['cờ rõ-lên-khi-rê-chuột', dom.hoverAttr === '1' ? 'bật' : 'tắt'])
  results.push(['gói hiển thị', dom.plan])
  results.push(['có đường kẻ tách ngữ cảnh', dom.hasSep])

  // ---- Mục 10: tiêu đề trung tính — 1 AI thì nêu đúng tên AI đó, không ghi cứng "Claude" -------
  const titleOne = await w.webContents.executeJavaScript(`document.getElementById('titleText').textContent`)
  results.push(['mục 10: tiêu đề với 1 AI (Claude)', titleOne === 'Claude' ? '✅ ' + titleOne : '❌ ' + titleOne])
  if (titleOne !== 'Claude') errors.push('mục 10: tiêu đề 1-AI không đúng tên provider — hiện "' + titleOne + '"')

  // ---- Mục 13: nút mở rộng phải là <button> có aria-expanded đổi theo trạng thái ---------------
  const expandBefore = await w.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('expand')
    return { tag: el.tagName, aria: el.getAttribute('aria-expanded') }
  })()`)
  results.push(['mục 13: #expand là <button> (bấm Tab tới được)', expandBefore.tag === 'BUTTON' ? '✅' : '❌ ' + expandBefore.tag])
  results.push(['mục 13: aria-expanded ban đầu = false', expandBefore.aria === 'false' ? '✅' : '❌ ' + expandBefore.aria])
  await w.webContents.executeJavaScript(`document.getElementById('expand').click(); true`)
  await new Promise((r) => setTimeout(r, 150))
  const ariaAfter = await w.webContents.executeJavaScript(`document.getElementById('expand').getAttribute('aria-expanded')`)
  results.push(['mục 13: aria-expanded đổi thành true khi mở panel', ariaAfter === 'true' ? '✅' : '❌ ' + ariaAfter])
  if (expandBefore.tag !== 'BUTTON') errors.push('mục 13: #expand không phải <button> — không bấm được bằng bàn phím')
  if (ariaAfter !== 'true') errors.push('mục 13: click #expand không cập nhật aria-expanded')
  await w.webContents.executeJavaScript(`document.getElementById('expand').click(); true`)   // đóng lại, trả trạng thái ban đầu

  // ---- Mục 12: giữ mục cao nhất VÀ hai cửa sổ 5 giờ + Tuần của Claude --------------------------
  w.webContents.send('usage-data', { ...FAKE, config: { ...FAKE.config, layout: 'bars', topMetricOnly: true } })
  await new Promise((r) => setTimeout(r, 250))
  const topOnlyAll = await w.webContents.executeJavaScript(`[...document.querySelectorAll('.row .label')].map(e => e.textContent)`)
  // "Ngữ cảnh phiên" là mục RIÊNG (số cục bộ, không phải hạn mức tài khoản) — topMetricOnly chỉ
  // gộp các mục CỦA MỘT AI lại, không đụng tới dòng này. Loại nó ra trước khi đếm.
  const topOnly = topOnlyAll.filter((l) => l !== 'Ngữ cảnh phiên')
  const topOnlyOk = topOnly.length === 3 && topOnly[0] === 'Opus · tuần' && topOnly[1] === '5 giờ' && topOnly[2] === 'Tuần'
  results.push(['mục 12: topMetricOnly giữ mục căng nhất + 5 giờ + Tuần Claude',
    topOnlyOk ? '✅ ' + topOnly.join(', ') : '❌ ' + topOnlyAll.join(', ')])
  if (!topOnlyOk) errors.push('mục 12: topMetricOnly không giữ đủ mục cao nhất + 5 giờ + Tuần Claude — còn ' + topOnlyAll.join(', '))
  w.webContents.send('usage-data', FAKE)
  await new Promise((r) => setTimeout(r, 250))
  results.push(['chiều cao tự báo về main', heightReported ? Math.round(heightReported) + 'px' : '❌ KHÔNG báo'])

  // ---- Chú thích trần ngữ cảnh phải nói ĐÚNG mức chắc chắn ----------------------
  // Lỗi 27/07: trần 200k đoán mò lại hiện như sự thật → % ngữ cảnh sai gấp 5 mà không có dấu hiệu gì.
  const CTX_CASES = [
    ['bằng chứng (>200k)', { tokens: 291872, limit: 1000000, limitSource: 'evidence', pct: 29.2 }, (s) => !/ước tính|≈/.test(s)],
    ['phỏng đoán (<200k)', { tokens: 83867, limit: 200000, limitSource: 'guess', pct: 41.9 }, (s) => /≈/.test(s) && /ước tính/.test(s)],
    ['đặt tay', { tokens: 83867, limit: 1000000, limitSource: 'manual', pct: 8.4 }, (s) => /đặt tay/.test(s) && !/ước tính/.test(s)],
    ['đặt tay SAI (vượt trần)', { tokens: 300000, limit: 200000, limitSource: 'manual', overLimit: true, pct: 100 }, (s) => /vượt trần/.test(s)],
  ]
  for (const [tên, ctx, ok] of CTX_CASES) {
    w.webContents.send('usage-data', { ...FAKE, context: { available: true, limitInferred: ctx.limitSource === 'guess', ...ctx } })
    await new Promise((r) => setTimeout(r, 250))
    const note = await w.webContents.executeJavaScript(
      `[...document.querySelectorAll('.row')].find(r => r.querySelector('.label').textContent === 'Ngữ cảnh phiên')?.querySelector('.note')?.textContent || ''`)
    results.push([`  ctx · ${tên}`, `${ok(note) ? '✅' : '❌ SAI'} "${note}"`])
    if (!ok(note)) errors.push(`chú thích ngữ cảnh sai ở ca "${tên}": ${note}`)
  }
  // ---- 5 bố cục đều phải dựng ra nội dung THẬT ---------------------------------
  // Mỗi bố cục có bộ lớp CSS riêng; dựng ra khung rỗng mà không có mục nào là hỏng ngầm
  // (nhìn ảnh chụp không ra vì khung vẫn còn đó).
  const LAYOUT_PROBE = {
    bars: '.row .bar > i', rings: '.ring svg .ring-arc', strip: '.strip-item .strip-fill',
    dashboard: '.dash .dash-col .row', terminal: '.term .term-line .term-bar',
  }
  for (const [layout, sel] of Object.entries(LAYOUT_PROBE)) {
    w.webContents.send('usage-data', { ...FAKE, config: { ...FAKE.config, layout } })
    await new Promise((r) => setTimeout(r, 300))
    const got = await w.webContents.executeJavaScript(`(() => ({
      n: document.querySelectorAll('${sel}').length,
      attr: document.body.dataset.layout,
      h: Math.round(document.getElementById('card').getBoundingClientRect().height)
    }))()`)
    const ok = got.n >= 4 && got.attr === layout
    results.push([`  bố cục · ${layout}`, `${ok ? '✅' : '❌'} ${got.n} phần tử · data-layout=${got.attr} · cao ${got.h}px`])
    if (!ok) errors.push(`bố cục ${layout} dựng thiếu (${got.n} phần tử qua "${sel}")`)

    // Vòng tròn: cung PHẢI `fill:none`. Từng vấp — gộp fill vào luật `.ring-arc.ok` làm cung bị
    // tô đặc thành cái đĩa, nhìn 6% mà tưởng gần đầy. Ảnh chụp mới thấy, DOM đếm được thì không.
    if (layout === 'rings') {
      const fills = await w.webContents.executeJavaScript(
        `[...document.querySelectorAll('.ring-arc')].map(e => getComputedStyle(e).fill)`)
      const đặc = fills.filter((f) => f !== 'none')
      results.push(['  vòng tròn không bị tô đặc', đặc.length ? '❌ ' + đặc.join(',') : '✅ fill:none cả ' + fills.length])
      if (đặc.length) errors.push('cung vòng tròn bị tô đặc (fill=' + đặc[0] + ') — nhìn ra đĩa, sai mức %')
    }
  }

  // ---- Nhiều AI: phải có nhãn nhóm + AI lỗi phải NÓI RA ------------------------
  w.webContents.send('usage-data', { ...FAKE_MULTI, config: { ...FAKE.config, layout: 'bars' } })
  await new Promise((r) => setTimeout(r, 300))
  const multi = await w.webContents.executeJavaScript(`(() => ({
    heads: [...document.querySelectorAll('.group-head')].map(e => e.textContent),
    msgs: [...document.querySelectorAll('#body .msg')].map(e => e.textContent),
    plan: document.getElementById('plan').textContent
  }))()`)
  results.push(['nhãn nhóm khi >1 AI', multi.heads.length >= 2 ? '✅ ' + multi.heads.join(' / ') : '❌ ' + JSON.stringify(multi.heads)])
  results.push(['AI lỗi có báo ra không', /Gemini/.test(multi.msgs.join(' ')) ? '✅ ' + multi.msgs.join(' | ') : '❌ nuốt lỗi im lặng'])
  results.push(['dòng trạng thái nhiều AI', multi.plan])
  if (multi.heads.length < 2) errors.push('nhiều AI mà không chèn nhãn nhóm — hạn mức bị trộn')
  if (!/Gemini/.test(multi.msgs.join(' '))) errors.push('AI lỗi biến mất khỏi widget mà không báo gì')

  // GPT Plus ở chế độ gọn cũng phải giữ đủ 5 giờ + Tuần, không vì % Tuần cao hơn mà mất 5 giờ.
  w.webContents.send('usage-data', { ...FAKE_MULTI, config: { ...FAKE.config, layout: 'bars', topMetricOnly: true } })
  await new Promise((r) => setTimeout(r, 250))
  const gptLabels = await w.webContents.executeJavaScript(`
    (() => {
      const head = [...document.querySelectorAll('.group-head')]
        .find((el) => el.textContent === 'GPT Plus')
      const labels = []
      let el = head?.nextElementSibling
      while (el && !el.classList.contains('group-head')) {
        const label = el.querySelector?.('.label')
        if (label) labels.push(label.textContent)
        el = el.nextElementSibling
      }
      return labels
    })()
  `)
  const gptTopOnlyOk = gptLabels.length === 2 && gptLabels.includes('5 giờ') && gptLabels.includes('Tuần')
  results.push(['mục 12: topMetricOnly giữ 5 giờ + Tuần GPT Plus',
    gptTopOnlyOk ? '✅ ' + gptLabels.join(', ') : '❌ ' + gptLabels.join(', ')])
  if (!gptTopOnlyOk) errors.push('mục 12: topMetricOnly không giữ đủ 5 giờ + Tuần GPT Plus — còn ' + gptLabels.join(', '))

  // ---- Mục 2: "đã cập nhật" phải theo fetchedAt THẬT, không phải giờ vẽ lại ------
  const fetchedAt3MinAgo = Date.now() - 3 * 60000
  w.webContents.send('usage-data', {
    ...FAKE, config: { ...FAKE.config, layout: 'bars' },
    providers: [{ ...FAKE.providers[0], fetchedAt: fetchedAt3MinAgo, stale: false }],
  })
  await new Promise((r) => setTimeout(r, 250))
  const updatedText = await w.webContents.executeJavaScript(`document.getElementById('updated').textContent`)
  results.push(['mục 2: "đã cập nhật" theo fetchedAt (3 phút trước)', /3 phút trước/.test(updatedText) ? '✅ ' + updatedText : '❌ ' + updatedText])
  if (!/3 phút trước/.test(updatedText)) errors.push('mục 2: $("updated") không theo fetchedAt thật — hiện "' + updatedText + '"')

  // ---- Mục 6: provider "stale" (mất mạng nhưng còn số cũ) phải hiện dấu cảnh báo -
  w.webContents.send('usage-data', {
    ...FAKE, config: { ...FAKE.config, layout: 'bars' },
    providers: [{ ...FAKE.providers[0], fetchedAt: fetchedAt3MinAgo, stale: true, error: 'NETWORK',
      metrics: FAKE.providers[0].metrics.map((m) => ({ ...m, stale: true, info: 'mất mạng · số lúc 14:00', resetAt: null })) }],
  })
  await new Promise((r) => setTimeout(r, 250))
  const staleDom = await w.webContents.executeJavaScript(`(() => ({
    plan: document.getElementById('plan').textContent,
    note: [...document.querySelectorAll('.row .note')].map(e => e.textContent).join('¶')
  }))()`)
  results.push(['mục 6: AI "mất mạng" vẫn hiện số cũ + cảnh báo ở tiêu đề', /⚠/.test(staleDom.plan) ? '✅ ' + staleDom.plan : '❌ ' + staleDom.plan])
  results.push(['mục 6: từng mục ghi rõ "mất mạng · số lúc …"', /mất mạng/.test(staleDom.note) ? '✅ ' + staleDom.note : '❌ ' + staleDom.note])
  if (!/⚠/.test(staleDom.plan)) errors.push('mục 6: provider stale không có dấu ⚠ ở dòng trạng thái')
  if (!/mất mạng/.test(staleDom.note)) errors.push('mục 6: metric stale không hiện chú thích "mất mạng"')

  // ---- Mục 3: today.partial phải hiện "chưa đầy đủ" / "≥", không trình bày như tổng chắc chắn ---
  w.webContents.send('usage-data', {
    ...FAKE, config: { ...FAKE.config, layout: 'bars' },
    today: { ...FAKE.today, partial: true, sessionsCounted: 20, sessionsToday: 27 },
  })
  await new Promise((r) => setTimeout(r, 250))
  await w.webContents.executeJavaScript(`document.getElementById('expand').click(); true`)
  await new Promise((r) => setTimeout(r, 250))
  const partialDom = await w.webContents.executeJavaScript(`(() => ({
    title: [...document.querySelectorAll('#panel .section-title')].map(e => e.textContent).find(t => t.includes('Hôm nay')) || '',
    lines: [...document.querySelectorAll('#panel .stat-line')].map(e => e.textContent)
  }))()`)
  results.push(['mục 3: tiêu đề "Hôm nay" báo "chưa đầy đủ" khi partial', /chưa đầy đủ/.test(partialDom.title) ? '✅ ' + partialDom.title : '❌ ' + partialDom.title])
  results.push(['mục 3: số token/lượt hỏi có dấu "≥" khi partial', partialDom.lines.some((l) => l.includes('≥')) ? '✅ ' + partialDom.lines.join(' | ') : '❌ ' + partialDom.lines.join(' | ')])
  results.push(['mục 3: dòng Phiên nói rõ chỉ cộng 20/27', partialDom.lines.some((l) => /27.*20|20.*27/.test(l)) ? '✅' : '❌ ' + partialDom.lines.join(' | ')])
  if (!/chưa đầy đủ/.test(partialDom.title)) errors.push('mục 3: today.partial=true nhưng panel không báo "chưa đầy đủ"')
  if (!partialDom.lines.some((l) => l.includes('≥'))) errors.push('mục 3: today.partial=true nhưng token/lượt hỏi không có dấu "≥"')
  await w.webContents.executeJavaScript(`document.getElementById('expand').click(); true`)

  // ---- Dự báo "hết ~HH:MM" phải bám đúng mục có forecast -----------------------
  const fcNote = await w.webContents.executeJavaScript(
    `[...document.querySelectorAll('.row')].map(r => r.querySelector('.note')?.textContent || '').join('¶')`)
  results.push(['dự báo hết quota', /hết ~\d{2}:\d{2}/.test(fcNote) ? '✅ có hiện' : '❌ không thấy'])
  if (!/hết ~\d{2}:\d{2}/.test(fcNote)) errors.push('có forecasts nhưng widget không hiện "hết ~HH:MM"')

  // ---- Panel mở rộng: bấm ▾ phải ra số hôm nay --------------------------------
  await w.webContents.executeJavaScript(`document.getElementById('expand').click(); true`)
  await new Promise((r) => setTimeout(r, 300))
  const panel = await w.webContents.executeJavaScript(`(() => ({
    open: getComputedStyle(document.getElementById('panel')).display,
    lines: [...document.querySelectorAll('#panel .stat-line')].map(e => e.textContent),
    sess: document.querySelectorAll('#panel .session-row').length
  }))()`)
  results.push(['panel mở rộng', `${panel.open !== 'none' ? '✅ mở' : '❌ không mở'} · ${panel.sess} phiên · ${panel.lines.join(' | ')}`])
  if (panel.open === 'none') errors.push('bấm ▾ mà panel không mở')
  await w.webContents.executeJavaScript(`document.getElementById('expand').click(); true`)

  w.webContents.send('usage-data', FAKE)
  await new Promise((r) => setTimeout(r, 250))

  // Nút ⚙ / ⟳ phải là vùng KHÔNG kéo, nếu không thì bấm chỉ kéo cửa sổ chứ không ăn click.
  const btns = await w.webContents.executeJavaScript(`(() => {
    const g = (id) => { const el = document.getElementById(id); return el
      ? { có: true, region: getComputedStyle(el).webkitAppRegion } : { có: false } }
    return { drag: getComputedStyle(document.getElementById('drag')).webkitAppRegion,
             settings: g('btn-settings'), refresh: g('btn-refresh') } })()`)
  results.push(['thanh tiêu đề kéo được', btns.drag])
  results.push(['nút ⚙ (vùng kéo?)', `${btns.settings.có ? 'có nút' : '❌ KHÔNG có'} · region=${btns.settings.region}` +
    (btns.settings.region === 'no-drag' ? ' ✅' : ' ❌ sẽ bị nuốt click')])
  results.push(['nút ⟳ (vùng kéo?)', `${btns.refresh.có ? 'có nút' : '❌ KHÔNG có'} · region=${btns.refresh.region}` +
    (btns.refresh.region === 'no-drag' ? ' ✅' : ' ❌ sẽ bị nuốt click')])

  await w.webContents.executeJavaScript(`document.getElementById('btn-settings').click();
    document.getElementById('btn-refresh').click(); true`)
  await new Promise((r) => setTimeout(r, 400))

  // ---- 2. Trang cài đặt --------------------------------------------------------
  const s = new BrowserWindow({ show: false, width: 380, height: 520, webPreferences: { preload: PRELOAD_SETTINGS, contextIsolation: true, sandbox: true } })
  watch(s, 'settings')
  await s.loadFile(path.join(R, 'settings.html'))
  await new Promise((r) => setTimeout(r, 700))

  const IDS = ['layout', 'palette', 'compact', 'opacity', 'opacityVal', 'hoverBoost', 'width',
    'showContext', 'contextLimit', 'showForecast', 'providers', 'alertsEnabled', 'alertWarnPct',
    'alertCritPct', 'refreshApiSec', 'refreshLocalSec', 'followClaudeCli', 'hotkey', 'reset', 'refresh']
  const set = await s.webContents.executeJavaScript(`(() => {
    const missing = ${JSON.stringify(IDS)}.filter(id => !document.getElementById(id))
    const filled = { layout: layout.value, palette: palette.value, width: width.value,
                     warn: alertWarnPct.value, api: refreshApiSec.value, hotkey: hotkey.value,
                     ctx: showContext.checked, forecast: showForecast.checked }
    return { missing, filled, bridge: typeof window.api?.setConfig,
             layoutOpts: [...layout.options].map(o => o.value),
             paletteOpts: [...palette.options].map(o => o.value),
             aiBoxes: [...document.querySelectorAll('#providers input')].length }
  })()`)
  results.push(['phần tử cài đặt thiếu', set.missing.length ? '❌ ' + set.missing.join(', ') : 'không thiếu cái nào'])
  results.push(['giá trị nạp sẵn từ config', JSON.stringify(set.filled)])
  results.push(['cầu nối window.api', set.bridge])
  results.push(['số bố cục chọn được', `${set.layoutOpts.length} — ${set.layoutOpts.join(',')}`])
  results.push(['số bảng màu chọn được', `${set.paletteOpts.length} — ${set.paletteOpts.join(',')}`])
  results.push(['ô "AI hiển thị"', set.aiBoxes ? `✅ ${set.aiBoxes} AI` : '❌ không dựng được'])
  if (set.missing.length) errors.push('thiếu phần tử cài đặt: ' + set.missing.join(', '))
  if (!set.aiBoxes) errors.push('mục AI hiển thị không dựng được checkbox nào')

  // Đổi bố cục phải bắn set-config ngay (áp dụng trực tiếp, không có nút Lưu).
  await s.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('layout'); el.value = 'rings';
    el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await new Promise((r) => setTimeout(r, 300))
  const layoutSent = results.some(([k, v]) => k === 'set-config nhận được' && /"layout":"rings"/.test(v))
  results.push(['đổi bố cục → set-config', layoutSent ? '✅ đã bắn' : '❌ KHÔNG bắn'])
  if (!layoutSent) errors.push('đổi bố cục không gửi set-config')

  // Công tắc theo Claude CLI phải áp dụng trực tiếp như các checkbox khác.
  await s.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('followClaudeCli'); el.checked = true;
    el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await new Promise((r) => setTimeout(r, 300))
  const followSent = results.some(([k, v]) => k === 'set-config nhận được' && /"followClaudeCli":true/.test(v))
  results.push(['bật theo Claude CLI → set-config', followSent ? '✅ đã bắn' : '❌ KHÔNG bắn'])
  if (!followSent) errors.push('bật theo Claude CLI không gửi set-config')

  // Kéo thanh Độ trong → số % phải chạy theo NGAY (không đợi debounce) và bắn set-config.
  const opAfter = await s.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('opacity'); el.value = '0.25';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return document.getElementById('opacityVal').textContent })()`)
  results.push(['kéo Độ trong → nhãn %', opAfter === '25%' ? '25% ✅' : `"${opAfter}" ❌`])
  await new Promise((r) => setTimeout(r, 300))

  // Đổi bảng màu như người dùng thật → phải bắn set-config ngay (áp dụng trực tiếp).
  await s.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('palette'); el.value = 'light';
    el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await new Promise((r) => setTimeout(r, 300))

  // Ô "Trần ngữ cảnh" phải nạp sẵn đúng và đổi là bắn set-config ngay (áp dụng trực tiếp).
  const ctxSel = await s.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('contextLimit')
    const opts = [...el.options].map(o => o.value)
    const loaded = el.value
    el.value = '1000000'; el.dispatchEvent(new Event('input', { bubbles: true }))
    return { opts, loaded } })()`)
  await new Promise((r) => setTimeout(r, 300))
  const đãBắn = results.some(([k, v]) => k === 'set-config nhận được' && /contextLimit/.test(v))
  results.push(['ô Trần ngữ cảnh', `nạp="${ctxSel.loaded}" · lựa chọn=[${ctxSel.opts}] · ` +
    (đãBắn ? 'đổi → đã bắn set-config ✅' : '❌ đổi mà KHÔNG bắn set-config')])
  if (!đãBắn) errors.push('đổi Trần ngữ cảnh không gửi set-config')

  // Phím tắt sai cú pháp → phải hiện dòng đỏ, KHÔNG được im lặng.
  await s.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('hotkey'); el.value = '###';
    el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await new Promise((r) => setTimeout(r, 900))
  const errText = await s.webContents.executeJavaScript(`document.getElementById('err').textContent`)
  results.push(['báo lỗi phím tắt sai', errText ? 'có: ' + errText.slice(0, 40) : '(trống — chỉ đúng nếu main báo hotkeyOk=true)'])

  console.log('\n===== KẾT QUẢ =====')
  for (const [k, v] of results) console.log(String(k).padEnd(34), v)
  console.log('\n===== LỖI CONSOLE =====')
  console.log(errors.length ? errors.join('\n') : '(không có)')
  const exitCode = errors.length ? 1 : 0
  setTimeout(() => process.exit(exitCode), 50)
})
