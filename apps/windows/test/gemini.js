// Test thuan Node cho providers/gemini.js — khong goi mang, chi test detect() qua thu muc tam
// va cac ham thuan (_internals).
const fs = require('fs');
const os = require('os');
const path = require('path');
const gemini = require('../src/providers/gemini');
const { groupQuotas, findQuotaArray, shortModel } = gemini._internals;

let fail = 0;
function check(label, cond) {
  if (cond) { console.log('✅ ' + label); return; }
  fail++;
  console.log('❌ ' + label);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));

check('detect: chua co file oauth_creds.json → false', gemini.detect(tmp) === false);

fs.writeFileSync(path.join(tmp, 'oauth_creds.json'), JSON.stringify({ refresh_token: 'x' }));
check('detect: co file nhung THIEU access_token → false', gemini.detect(tmp) === false);

fs.writeFileSync(path.join(tmp, 'oauth_creds.json'), JSON.stringify({ access_token: 'abc', refresh_token: 'x' }));
check('detect: co access_token → true', gemini.detect(tmp) === true);

fs.writeFileSync(path.join(tmp, 'oauth_creds.json'), '{ khong phai json');
check('detect: file JSON hong → false, khong throw', gemini.detect(tmp) === false);

console.log('\n--- shortModel: rut gon ten model ---');
check('bo tien to "models/"', shortModel('models/gemini-2.5-pro') === 'Gemini 2.5-pro');
check('bo hau to "-latest"', shortModel('gemini-2.5-flash-latest') === 'Gemini 2.5-flash');

console.log('\n--- groupQuotas: remainingFraction (CON LAI) → pct (DA DUNG), gom model trung nhau ---');
const grouped = groupQuotas([
  { modelId: 'gemini-2.5-pro', remainingFraction: 0.8, resetTime: '2026-09-01T00:00:00Z' },
  { modelId: 'gemini-2.5-flash', remainingFraction: 0.8, resetTime: '2026-09-01T00:00:00Z' },
  { modelId: 'gemini-1.5-pro', remainingFraction: 0.5, resetTime: '2026-09-02T00:00:00Z' },
]);
check('2 model cung fraction+reset → gom thanh 1 muc', grouped.length === 2);
const g80 = grouped.find((g) => g.pct === 20);
check('remainingFraction 0.8 (con 80%) → pct 20 (da dung 20%)', !!g80);
check('nhan gom ca 2 ten model, cach nhau " & "', g80 && /&/.test(g80.label));
check('thieu remainingFraction (khong phai so) → bi bo qua, khong lam vo groupQuotas',
  groupQuotas([{ modelId: 'x' }, { modelId: 'y', remainingFraction: 0.9 }]).length === 1);

console.log('\n--- findQuotaArray: do rong response, khong cam duong dan cung ---');
check('tim thay o field ten khac nhau tuy backend (modelQuotas)',
  findQuotaArray({ modelQuotas: [{ remainingFraction: 0.5 }] }).length === 1);
check('tim thay khi long trong object khac (nested)',
  findQuotaArray({ wrapper: { quotaInfos: [{ remainingFraction: 0.3 }] } }).length === 1);
check('khong co gi khop → mang rong, khong throw', findQuotaArray({ foo: 'bar' }).length === 0);
check('vong lap tu tham chieu vong khong lam treo (depth an toan vi object JSON khong the tu tham chieu)',
  Array.isArray(findQuotaArray({})));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n❌ ${fail} ca sai` : '\n✅ tất cả đạt');
process.exit(fail ? 1 : 0);
