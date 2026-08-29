// Test thuan Node cho i18n.js (Windows) — khong dung Electron.
const assert = require('assert');
const { getStrings, resolveLang, translateError, DICTS } = require('../src/i18n');

let fail = 0;
function check(label, cond) {
  if (cond) { console.log('✅ ' + label); return; }
  fail++;
  console.log('❌ ' + label);
}

check('resolveLang: dat tay vi thang moi locale', resolveLang('vi', 'en-US') === 'vi');
check('resolveLang: dat tay en thang moi locale', resolveLang('en', 'vi-VN') === 'en');
check('resolveLang: auto + locale vi-VN → vi', resolveLang('auto', 'vi-VN') === 'vi');
check('resolveLang: auto + locale en-US → en', resolveLang('auto', 'en-US') === 'en');
check('resolveLang: auto + locale la (fr-FR) → en (mac dinh)', resolveLang('auto', 'fr-FR') === 'en');
check('resolveLang: thieu locale → en', resolveLang('auto', undefined) === 'en');

check('getStrings tra dung dict vi', getStrings('vi', 'en-US').appTitle === 'AI Usage Widget');
check('getStrings tra dung dict en', getStrings('en', 'vi-VN').refresh === 'Refresh');

const viKeys = Object.keys(DICTS.vi).sort();
const enKeys = Object.keys(DICTS.en).sort();
assert.deepStrictEqual(viKeys, enKeys);
check('vi va en co DUNG cung mot bo khoa', true);

check('translateError: EXPIRED → dich dung', translateError('EXPIRED', DICTS.vi) === DICTS.vi.errExpired);
check('translateError: tien to duoc nhan dien (EXPIRED_XYZ)', translateError('EXPIRED_XYZ', DICTS.en) === DICTS.en.errExpired);
check('translateError: ma la → errOther kem ma goc', translateError('WHATEVER', DICTS.en) === DICTS.en.errOther + ': WHATEVER');
check('translateError: ma rong khong throw', translateError('', DICTS.vi) === DICTS.vi.errOther + ': ');

console.log(fail ? `\n❌ ${fail} ca sai` : '\n✅ tat ca dat');
process.exit(fail ? 1 : 0);
