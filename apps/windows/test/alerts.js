// Test thuan Node cho alerts.js — chi goi checkAlerts()/resetState() (thuan JS, khong dung
// Notification that cua Electron). notify() KHONG duoc goi o day vi can Electron that chay.
const { checkAlerts, resetState, _flatten } = require('../src/alerts');

let fail = 0;
function check(label, cond) {
  if (cond) { console.log('✅ ' + label); return; }
  fail++;
  console.log('❌ ' + label);
}

const S = { fiveHour: '5-Hour', weeklyAll: 'Weekly' };
const CFG = { alertsEnabled: true, alertWarnPct: 80, alertCritPct: 95 };

resetState();
console.log('--- Nguong warn/crit co ban ---');
check('duoi nguong warn → khong bao gi ca',
  checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 50 }], CFG, S).length === 0);

resetState();
check('vua cham nguong warn (80) → bao 1 lan, muc warn',
  checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 80 }], CFG, S)[0].level === 'warn');

resetState();
check('vua cham nguong crit (95) → bao muc crit',
  checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 95 }], CFG, S)[0].level === 'crit');

console.log('\n--- Chong spam: da bao roi thi im lang o cung muc ---');
resetState();
checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 82 }], CFG, S);
check('goi lai LIEN TUC cung muc warn → khong bao lai (im lang)',
  checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 83 }], CFG, S).length === 0);

console.log('\n--- Leo tu warn len crit VAN phai bao (khong bi coi la "da bao roi") ---');
resetState();
checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 82 }], CFG, S);
const escalated = checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 96 }], CFG, S);
check('warn → crit → bao lai voi muc crit', escalated.length === 1 && escalated[0].level === 'crit');

console.log('\n--- Da crit roi tut ve warn (van tren nguong) → im lang, KHONG bao lui ---');
resetState();
checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 96 }], CFG, S);
check('crit → warn (van >= 80) → khong bao gi (bao lui la vo ich)',
  checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 82 }], CFG, S).length === 0);

console.log('\n--- Hysteresis 10 diem: phai tut SAU nguong warn-10 moi duoc bao lai khi leo len ---');
resetState();
checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 82 }], CFG, S); // bao warn
check('tut xuong 75 (warn=80, chua qua nguong 80-10=70) → van bi coi la "chua reset", bao lai vao lai muc warn thi im lang',
  checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 76 }], CFG, S).length === 0);
check('tut xuong duoi 70 (80-10) roi leo LAI len 82 → duoc bao lai (khong con la muc cu)', (() => {
  checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 65 }], CFG, S); // tut qua sau nguong -> quen trang thai
  const again = checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 82 }], CFG, S);
  return again.length === 1 && again[0].level === 'warn';
})());

console.log('\n--- Cua so reset (resetAt doi) → quen trang thai cu, bao lai duoc ngay ---');
resetState();
checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 90, fiveHourResetAt: 1000 }], CFG, S);
const afterReset = checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 90, fiveHourResetAt: 2000 }], CFG, S);
check('resetAt doi (cua so moi) → bao lai ngay du pct khong doi', afterReset.length === 1);

console.log('\n--- AI bien mat khoi danh sach (tat trong Cai dat) → don trang thai ngam ---');
resetState();
checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 90 }], CFG, S);
checkAlerts([], CFG, S); // Claude bien mat
const reappear = checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 90 }], CFG, S);
check('AI tat roi bat lai → coi nhu MOI, bao lai (khong con nho trang thai cu)', reappear.length === 1);

console.log('\n--- Tat alertsEnabled → khong bao du vuot nguong bao nhieu ---');
resetState();
check('alertsEnabled: false → mang rong bat ke pct',
  checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 100 }], { ...CFG, alertsEnabled: false }, S).length === 0);

console.log('\n--- Khong bia canh bao cho AI dang loi hoac pct null ---');
resetState();
check('provider co error → bo qua hoan toan',
  checkAlerts([{ providerId: 'claude', providerName: 'Claude', error: 'NETWORK' }], CFG, S).length === 0);
check('pct null (chua doc duoc) → khong bao', checkAlerts([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: null }], CFG, S).length === 0);

console.log('\n--- scopedLimits: so cu (stale) khong duoc dung de bao canh bao moi ---');
resetState();
check('scoped stale=true → khong tinh du pct cao',
  checkAlerts([{ providerId: 'antigravity', providerName: 'Antigravity', scopedLimits: [{ label: 'x', pct: 99, stale: true }] }], CFG, S).length === 0);
check('scoped khong stale → tinh binh thuong',
  checkAlerts([{ providerId: 'antigravity', providerName: 'Antigravity', scopedLimits: [{ label: 'x', pct: 99 }] }], CFG, S).length === 1);

console.log('\n--- _flatten: gop 5h/weekly/scoped thanh 1 danh sach phang, giu dung key duy nhat ---');
const flat = _flatten([{ providerId: 'claude', providerName: 'Claude', fiveHourPct: 10, weeklyPct: 20, scopedLimits: [{ label: 'Opus', pct: 30 }] }]);
check('gom du ca 3 loai (5h/weekly/scoped)', flat.length === 3);
check('key la providerId|label, khong trung giua 2 AI khac nhau co cung nhan "Tuần"',
  flat.every((x) => x.key.startsWith('claude|')));

console.log(fail ? `\n❌ ${fail} ca sai` : '\n✅ tất cả đạt');
process.exit(fail ? 1 : 0);
