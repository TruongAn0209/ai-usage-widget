// Kiểm `sanitizeConfig` — chạy bằng Node thuần, không cần Electron:
//   node test/config-schema.js
//
// Vì sao phải có file này (mục 8, codex soi ra 02/08): main.js nhận `patch` thẳng từ trang Cài đặt
// qua IPC và cũng parse thẳng config.json trên đĩa. Cả hai đường đều có thể mang giá trị sai kiểu
// (`disabledProviders: null`, `width: "abc"`, chiều cao/độ trong âm hoặc khổng lồ) — sanitizeConfig
// là chốt DUY NHẤT chặn trước khi những giá trị đó phá hình học cửa sổ hoặc crash lúc render.
const { sanitizeConfig } = require('../src/configSchema')

let fail = 0
function check(tên, thật, mong) {
  const ok = JSON.stringify(thật) === JSON.stringify(mong)
  if (!ok) fail++
  console.log(`${ok ? '✅' : '❌'} ${tên}`)
  if (!ok) console.log(`     mong : ${JSON.stringify(mong)}\n     thật : ${JSON.stringify(thật)}`)
}

const BASE = {
  corner: 'top-right', customPosition: null, palette: 'espresso', layout: 'bars', compact: false,
  opacity: 0.95, hoverBoost: true, width: 260, showForecast: true, disabledProviders: [],
  refreshApiMs: 180000, refreshLocalMs: 8000, refreshLocalProvidersMs: 15000,
  alertsEnabled: true, alertWarnPct: 80, alertCritPct: 95, hotkey: 'Control+Alt+U',
  showContext: true, contextLimit: 'auto',
  launchAtLogin: false, alwaysOnTop: true, locked: false, providerOrder: [], topMetricOnly: false,
  followClaudeCli: false,
}

console.log('--- mục 11/12: khoá mới cũng đi qua đúng luật ép kiểu/allowlist ---')
check('launchAtLogin: "yes" (không phải boolean) → giữ false', sanitizeConfig({ launchAtLogin: 'yes' }, BASE).launchAtLogin, false)
check('alwaysOnTop: true hợp lệ → nhận', sanitizeConfig({ alwaysOnTop: false }, BASE).alwaysOnTop, false)
check('followClaudeCli chỉ nhận boolean', sanitizeConfig({ followClaudeCli: 'yes' }, BASE).followClaudeCli, false)
check('followClaudeCli: true hợp lệ → nhận', sanitizeConfig({ followClaudeCli: true }, BASE).followClaudeCli, true)
check('providerOrder: null → giữ mảng cũ', sanitizeConfig({ providerOrder: null }, BASE).providerOrder, [])
check('providerOrder: ["codex","claude"] hợp lệ → nhận', sanitizeConfig({ providerOrder: ['codex', 'claude'] }, BASE).providerOrder, ['codex', 'claude'])
check('topMetricOnly: 1 (không phải boolean) → giữ false', sanitizeConfig({ topMetricOnly: 1 }, BASE).topMetricOnly, false)

console.log('--- Kiểu sai bị ép về giá trị CŨ, không phá config ---')
check('disabledProviders: null → giữ mảng cũ', sanitizeConfig({ disabledProviders: null }, BASE).disabledProviders, [])
check('width: "abc" (không phải số) → giữ 260', sanitizeConfig({ width: 'abc' }, BASE).width, 260)
check('opacity: "nửa trong suốt" → giữ 0.95', sanitizeConfig({ opacity: 'nửa trong suốt' }, BASE).opacity, 0.95)
check('layout lạ "hologram" → giữ "bars"', sanitizeConfig({ layout: 'hologram' }, BASE).layout, 'bars')
check('palette lạ → giữ "espresso"', sanitizeConfig({ palette: 'vang-kim' }, BASE).palette, 'espresso')
check('corner lạ → giữ "top-right"', sanitizeConfig({ corner: 'giữa-màn-hình' }, BASE).corner, 'top-right')
check('compact: "yes" (không phải boolean) → giữ false', sanitizeConfig({ compact: 'yes' }, BASE).compact, false)
check('khoá lạ __proto__ bị bỏ qua, không rơi vào output', 'polluted' in sanitizeConfig({ __proto__: 'polluted' }, BASE), false)

console.log('\n--- Số bị KẸP về khoảng hợp lệ, không lọt giá trị điên rồ ---')
check('width: 999999 → kẹp về 460', sanitizeConfig({ width: 999999 }, BASE).width, 460)
check('width: -50 → kẹp về 200', sanitizeConfig({ width: -50 }, BASE).width, 200)
check('opacity: 5 → kẹp về 1', sanitizeConfig({ opacity: 5 }, BASE).opacity, 1)
check('opacity: -1 → kẹp về 0.15', sanitizeConfig({ opacity: -1 }, BASE).opacity, 0.15)
check('refreshApiMs: 1000 (dưới sàn 429) → kẹp về 180000', sanitizeConfig({ refreshApiMs: 1000 }, BASE).refreshApiMs, 180000)

console.log('\n--- Quan hệ warn < crit luôn được giữ ---')
check('đặt warn=90 crit=80 (đảo ngược) → crit tự nhích lên trên warn',
  sanitizeConfig({ alertWarnPct: 90, alertCritPct: 80 }, BASE).alertCritPct >= 91, true)
check('chỉ đổi crit xuống 50 (dưới warn 80 mặc định) → warn tự hạ xuống dưới crit',
  sanitizeConfig({ alertCritPct: 50 }, BASE).alertWarnPct <= 49, true)

console.log('\n--- customPosition: null hợp lệ, object thiếu trục bị bỏ ---')
check('customPosition: null → giữ null', sanitizeConfig({ customPosition: null }, BASE).customPosition, null)
check('customPosition: {x:10,y:20} → giữ nguyên', sanitizeConfig({ customPosition: { x: 10, y: 20 } }, BASE).customPosition, { x: 10, y: 20 })
check('customPosition: {x:"a"} thiếu/sai kiểu → giữ giá trị cũ (null)',
  sanitizeConfig({ customPosition: { x: 'a' } }, { ...BASE, customPosition: null }).customPosition, null)

console.log('\n--- contextLimit: "auto" hoặc chuỗi số dương ---')
check('contextLimit: "auto"', sanitizeConfig({ contextLimit: 'auto' }, BASE).contextLimit, 'auto')
check('contextLimit: 1000000 (number) → ép thành chuỗi', sanitizeConfig({ contextLimit: 1000000 }, BASE).contextLimit, '1000000')
check('contextLimit: "không phải số" → giữ "auto"', sanitizeConfig({ contextLimit: 'không phải số' }, BASE).contextLimit, 'auto')

console.log('\n--- Chỉ đổi ĐÚNG khoá có trong patch, không đụng khoá khác ---')
check('patch chỉ có width → không có khoá layout trong kết quả', 'layout' in sanitizeConfig({ width: 300 }, BASE), false)

console.log('\n--- mục i18n: lang chỉ nhận auto/vi/en ---')
check('lang: "en" hợp lệ → nhận', sanitizeConfig({ lang: 'en' }, BASE).lang, 'en')
check('lang: "vi" hợp lệ → nhận', sanitizeConfig({ lang: 'vi' }, BASE).lang, 'vi')
check('lang: "auto" hợp lệ → nhận', sanitizeConfig({ lang: 'auto' }, BASE).lang, 'auto')
check('lang: "fr" không hợp lệ → giữ giá trị cũ', sanitizeConfig({ lang: 'fr' }, { ...BASE, lang: 'auto' }).lang, 'auto')

console.log(fail ? `\n❌ ${fail} ca sai` : '\n✅ tất cả đạt')
process.exit(fail ? 1 : 0)
