// Test thuan Node cho configSchema.js (Windows) — khong dung Electron.
const assert = require('assert');
const { sanitizeSettingsPatch } = require('../src/configSchema');

let fail = 0;
function check(label, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    console.log('✅ ' + label);
  } catch {
    fail++;
    console.log('❌ ' + label, '— got', JSON.stringify(actual), 'want', JSON.stringify(expected));
  }
}

const IDS = ['claude', 'codex', 'antigravity', 'grok', 'gemini', 'openrouter'];

console.log('--- Input rac o dau vao khong duoc throw, tra ve rong ---');
check('null → {}', sanitizeSettingsPatch(null, IDS), {});
check('undefined → {}', sanitizeSettingsPatch(undefined, IDS), {});
check('mang (khong phai object thuong) → {}', sanitizeSettingsPatch([1, 2], IDS), {});
check('chuoi → {}', sanitizeSettingsPatch('abc', IDS), {});

console.log('\n--- Enum: chi nhan gia tri trong danh sach da biet ---');
check('lang: "en" hop le → nhan', sanitizeSettingsPatch({ lang: 'en' }, IDS).lang, 'en');
check('lang: "fr" khong hop le → khong co trong ket qua', 'lang' in sanitizeSettingsPatch({ lang: 'fr' }, IDS), false);
check('layout: "bars" (chi co ben macOS) khong hop le tren Windows → bo qua', 'layout' in sanitizeSettingsPatch({ layout: 'bars' }, IDS), false);
check('layout: "dashboard" hop le → nhan', sanitizeSettingsPatch({ layout: 'dashboard' }, IDS).layout, 'dashboard');
check('palette: "gemini" (palette theo hang, chi co Windows) hop le → nhan', sanitizeSettingsPatch({ palette: 'gemini' }, IDS).palette, 'gemini');
check('corner: gia tri la → bo qua', 'corner' in sanitizeSettingsPatch({ corner: 'center' }, IDS), false);
check('size: "large" hop le → nhan', sanitizeSettingsPatch({ size: 'large' }, IDS).size, 'large');

console.log('\n--- Boolean: chi ep kieu dung boolean ---');
check('showContextBar: true → nhan', sanitizeSettingsPatch({ showContextBar: true }, IDS).showContextBar, true);
check('showContextBar: "yes" (khong phai boolean) → bo qua', 'showContextBar' in sanitizeSettingsPatch({ showContextBar: 'yes' }, IDS), false);
check('alertsEnabled: 1 (khong phai boolean) → bo qua', 'alertsEnabled' in sanitizeSettingsPatch({ alertsEnabled: 1 }, IDS), false);

console.log('\n--- So: kep vao khoang hop le ---');
check('opacity: 5 → kep ve 1', sanitizeSettingsPatch({ opacity: 5 }, IDS).opacity, 1);
check('opacity: -1 → kep ve 0.15', sanitizeSettingsPatch({ opacity: -1 }, IDS).opacity, 0.15);
check('opacity: "abc" (khong phai so) → khong co trong ket qua', 'opacity' in sanitizeSettingsPatch({ opacity: 'abc' }, IDS), false);
check('maxSessions: 999 → kep ve 20', sanitizeSettingsPatch({ maxSessions: 999 }, IDS).maxSessions, 20);
check('maxSessions: 0 → kep ve 1', sanitizeSettingsPatch({ maxSessions: 0 }, IDS).maxSessions, 1);
check('contextLimitTokens: 500 (duoi san 1000) → kep ve 1000', sanitizeSettingsPatch({ contextLimitTokens: 500 }, IDS).contextLimitTokens, 1000);
check('contextLimitTokens: 99999999 → kep ve tran 2000000', sanitizeSettingsPatch({ contextLimitTokens: 99999999 }, IDS).contextLimitTokens, 2000000);
check('sessionActiveMinutes: 0 → kep ve 1', sanitizeSettingsPatch({ sessionActiveMinutes: 0 }, IDS).sessionActiveMinutes, 1);

console.log('\n--- accentColor: "auto" hoac ma hex #rrggbb ---');
check('accentColor: "auto" → nhan', sanitizeSettingsPatch({ accentColor: 'auto' }, IDS).accentColor, 'auto');
check('accentColor: "#1a2b3c" → nhan', sanitizeSettingsPatch({ accentColor: '#1a2b3c' }, IDS).accentColor, '#1a2b3c');
check('accentColor: "#1A2B3C" hoa → nhan (khong phan biet hoa/thuong)', sanitizeSettingsPatch({ accentColor: '#1A2B3C' }, IDS).accentColor, '#1A2B3C');
check('accentColor: "red" (ten mau, khong phai hex) → bo qua', 'accentColor' in sanitizeSettingsPatch({ accentColor: 'red' }, IDS), false);
check('accentColor: "#12345" (thieu 1 so) → bo qua', 'accentColor' in sanitizeSettingsPatch({ accentColor: '#12345' }, IDS), false);

console.log('\n--- hotkeyToggle: chuoi, toi da 100 ky tu ---');
check('hotkeyToggle hop le → nhan', sanitizeSettingsPatch({ hotkeyToggle: 'Control+Alt+U' }, IDS).hotkeyToggle, 'Control+Alt+U');
check('hotkeyToggle rong ("" = tat) → nhan', sanitizeSettingsPatch({ hotkeyToggle: '' }, IDS).hotkeyToggle, '');
check('hotkeyToggle qua dai (>100 ky tu) → bo qua', 'hotkeyToggle' in sanitizeSettingsPatch({ hotkeyToggle: 'x'.repeat(101) }, IDS), false);
check('hotkeyToggle khong phai chuoi → bo qua', 'hotkeyToggle' in sanitizeSettingsPatch({ hotkeyToggle: 123 }, IDS), false);

console.log('\n--- disabledProviders: loc theo danh sach id THAT, bo id la/trung ---');
check('id hop le duoc giu', sanitizeSettingsPatch({ disabledProviders: ['claude', 'grok'] }, IDS).disabledProviders, ['claude', 'grok']);
check('id la (khong ton tai) bi loai', sanitizeSettingsPatch({ disabledProviders: ['claude', 'khong-ton-tai'] }, IDS).disabledProviders, ['claude']);
check('id trung lap bi gop', sanitizeSettingsPatch({ disabledProviders: ['claude', 'claude', 'grok'] }, IDS).disabledProviders, ['claude', 'grok']);
check('khong phai mang → bo qua khoa nay', 'disabledProviders' in sanitizeSettingsPatch({ disabledProviders: 'claude' }, IDS), false);

console.log('\n--- Quan he warn < crit luon duoc giu (giong macOS) ---');
check('warn=90 crit=80 (dao nguoc) → warn tu ha xuong duoi crit',
  sanitizeSettingsPatch({ alertWarnPct: 90, alertCritPct: 80 }, IDS).alertWarnPct < 80, true);
check('chi doi crit → warn khong doi neu van < crit',
  sanitizeSettingsPatch({ alertCritPct: 95 }, IDS).alertWarnPct, undefined);

console.log('\n--- Chi doi DUNG khoa co trong patch ---');
check('patch chi co opacity → khong co khoa layout trong ket qua', 'layout' in sanitizeSettingsPatch({ opacity: 0.5 }, IDS), false);

console.log(fail ? `\n❌ ${fail} ca sai` : '\n✅ tat ca dat');
process.exit(fail ? 1 : 0);
