// Kiem tra cu phap moi file .js trong src/ va test/ bang `node --check`. Viet bang Node thuan
// (khong dung lenh shell rieng cua bash/cmd) de chay dung nhu nhau tren moi shell Windows.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function collectJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = [...collectJsFiles(path.join(ROOT, 'src')), ...collectJsFiles(path.join(ROOT, 'test'))];

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    console.log(`✅ ${path.relative(ROOT, file)}`);
  } catch (error) {
    failed++;
    console.error(`❌ ${path.relative(ROOT, file)}`);
    console.error(String(error.stderr || error.message));
  }
}

if (failed) {
  console.error(`\n❌ ${failed} file lỗi cú pháp`);
  process.exit(1);
}
console.log(`\n✅ ${files.length} file cú pháp hợp lệ`);
