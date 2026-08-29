// Test thuan Node cho providers/codex.js — detect() qua thu muc tam + cac ham thuan (_internals).
const fs = require('fs');
const os = require('os');
const path = require('path');
const codex = require('../src/providers/codex');
const { windowLabel, placeWindow, pct, toMs } = codex._internals;

let fail = 0;
function check(label, cond) {
  if (cond) { console.log('✅ ' + label); return; }
  fail++;
  console.log('❌ ' + label);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));

check('detect: chua co auth.json → false', codex.detect(tmp) === false);

fs.writeFileSync(path.join(tmp, 'auth.json'), JSON.stringify({ tokens: {} }));
check('detect: co file nhung THIEU access_token → false', codex.detect(tmp) === false);

fs.writeFileSync(path.join(tmp, 'auth.json'), JSON.stringify({ tokens: { access_token: 'abc', account_id: '1' } }));
check('detect: co access_token → true', codex.detect(tmp) === true);

fs.writeFileSync(path.join(tmp, 'auth.json'), 'khong phai json');
check('detect: file hong → false, khong throw', codex.detect(tmp) === false);

console.log('\n--- pct: lam tron 1 chu so thap phan, null/NaN → null ---');
check('pct(42.36) → 42.4', pct(42.36) === 42.4);
check('pct(null) → null', pct(null) === null);
check('pct(NaN) → null', pct(NaN) === null);

console.log('\n--- toMs: nhan ca epoch giay (so) lan ISO string ---');
check('epoch giay (so nho) → nhan *1000', toMs(1893456000) === 1893456000 * 1000);
check('epoch mili-giay (so da lon > 2e10) → giu nguyen', toMs(30000000000000) === 30000000000000);
check('chuoi ISO → parse dung', toMs('2026-09-01T00:00:00.000Z') === Date.parse('2026-09-01T00:00:00.000Z'));
check('null → null', toMs(null) === null);

console.log('\n--- windowLabel: suy loai cua so tu DO DAI THAT (giay), khong dan cung ---');
check('18000s (5 gio) → slot fiveHour', windowLabel(18000).slot === 'fiveHour');
check('sai so 10% van nhan dung 5h (16500s gan 18000)', windowLabel(16500).slot === 'fiveHour');
check('604800s (7 ngay) → slot weekly', windowLabel(604800).slot === 'weekly');
check('2592000s (30 ngay, KHONG phai 5h/7 ngay) → scoped, nhan theo so ngay', windowLabel(2592000).slot === 'scoped' && /ngày/.test(windowLabel(2592000).label));
check('3600s (1 gio, khong khop 5h) → scoped theo gio', windowLabel(3600).slot === 'scoped' && /giờ/.test(windowLabel(3600).label));
check('0/falsy → null', windowLabel(0) === null);

console.log('\n--- placeWindow: dat dung o (fiveHour/weekly/scoped), khong ghi de o da co ---');
const out1 = { fiveHourPct: null, weeklyPct: null, fiveHourResetAt: null, weeklyResetAt: null, scopedLimits: [] };
placeWindow(out1, { limit_window_seconds: 18000, used_percent: 42, reset_at: 1893456000 });
check('cua so 5h dau tien → ghi vao fiveHourPct', out1.fiveHourPct === 42);
placeWindow(out1, { limit_window_seconds: 18000, used_percent: 99, reset_at: 1893456000 });
check('cua so 5h THU HAI → KHONG ghi de (van giu 42)', out1.fiveHourPct === 42)
check('...ma roi xuong scopedLimits thay vi mat luon', out1.scopedLimits.length === 1)
placeWindow(out1, { limit_window_seconds: 999999999, used_percent: 10, reset_at: null });
check('cua so dai bat thuong (khong 5h/7 ngay) cung roi xuong scopedLimits', out1.scopedLimits.length === 2);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n❌ ${fail} ca sai` : '\n✅ tất cả đạt');
process.exit(fail ? 1 : 0);
