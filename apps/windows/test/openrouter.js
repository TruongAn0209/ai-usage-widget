// Test thuan Node cho providers/openrouter.js — detect()/envPath() qua thu muc tam + nextReset().
const fs = require('fs');
const os = require('os');
const path = require('path');
const openrouter = require('../src/providers/openrouter');
const { nextReset } = openrouter._internals;

let fail = 0;
function check(label, cond) {
  if (cond) { console.log('✅ ' + label); return; }
  fail++;
  console.log('❌ ' + label);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openrouter-test-'));
const envFile = path.join(tmp, '.env');

check('detect: chua co .env → false', openrouter.detect(tmp) === false);

fs.writeFileSync(envFile, 'SOME_OTHER_KEY=xyz\n');
check('detect: .env co nhung KHONG co OPENROUTER_API_KEY → false', openrouter.detect(tmp) === false);

fs.writeFileSync(envFile, 'FOO=1\nOPENROUTER_API_KEY=sk-abc123\nBAR=2\n');
check('detect: co OPENROUTER_API_KEY → true', openrouter.detect(tmp) === true);

fs.writeFileSync(envFile, 'export OPENROUTER_API_KEY="sk-quoted"\n');
check('detect: dang "export KEY=" + gia tri boc ngoac kep → van nhan dung', openrouter.detect(tmp) === true);

fs.writeFileSync(envFile, "OPENROUTER_API_KEY='sk-single-quoted'\n");
check('detect: gia tri boc ngoac don → van nhan dung', openrouter.detect(tmp) === true);

fs.writeFileSync(envFile, '# OPENROUTER_API_KEY=sk-commented-out\n');
check('detect: dong bi comment (#) → khong tinh, false', openrouter.detect(tmp) === false);

check('envPath: truyen thang duong dan .env → dung nguyen', openrouter.envPath(envFile) === envFile);
check('envPath: truyen thu muc → tu ghep .env vao sau', openrouter.envPath(tmp) === path.join(tmp, '.env'));

console.log('\n--- nextReset: chi nhan daily/weekly/monthly, khac thi null ---');
check('reset khong hop le (null/khac) → null', nextReset('yearly') === null);
check('reset undefined → null', nextReset(undefined) === null);
check('daily → mot moc trong tuong lai (00:00 UTC ngay mai tro di)', nextReset('daily') > Date.now());
check('weekly → mot moc trong tuong lai', nextReset('weekly') > Date.now());
check('monthly → mot moc trong tuong lai', nextReset('monthly') > Date.now());
check('daily luon la dung 00:00:00 UTC', new Date(nextReset('daily')).getUTCHours() === 0
  && new Date(nextReset('daily')).getUTCMinutes() === 0);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n❌ ${fail} ca sai` : '\n✅ tất cả đạt');
process.exit(fail ? 1 : 0);
