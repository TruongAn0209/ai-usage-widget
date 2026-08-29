// Test thuan Node cho providers/grok.js — detect() qua thu muc tam + bo giai ma protobuf toi
// gian (_internals). Khong goi mang that.
const fs = require('fs');
const os = require('os');
const path = require('path');
const grok = require('../src/providers/grok');
const { unframe, scan, readFieldPath, readVarint } = grok._internals;

let fail = 0;
function check(label, cond) {
  if (cond) { console.log('✅ ' + label); return; }
  fail++;
  console.log('❌ ' + label);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-test-'));

check('detect: chua co auth.json → false', grok.detect(tmp) === false);

fs.writeFileSync(path.join(tmp, 'auth.json'), JSON.stringify({}));
check('detect: file rong (khong entry nao co key) → false', grok.detect(tmp) === false);

fs.writeFileSync(path.join(tmp, 'auth.json'), JSON.stringify({
  'https://auth.x.ai::uuid-1': { key: 'abc', refresh_token: 'r1', email: 'a@b.c' },
}));
check('detect: co entry voi key → true', grok.detect(tmp) === true);

fs.writeFileSync(path.join(tmp, 'auth.json'), 'khong phai json');
check('detect: file hong → false, khong throw', grok.detect(tmp) === false);

// ---- Boc khung grpc-web: [flag 1 byte][do dai 4 byte BE][payload] ----------------------------
console.log('\n--- unframe: boc khung grpc-web, bo qua trailer (flag co bit 0x80) ---');
function frame(flag, payload) {
  const head = Buffer.alloc(5);
  head[0] = flag;
  head.writeUInt32BE(payload.length, 1);
  return Buffer.concat([head, payload]);
}
const p1 = Buffer.from([1, 2, 3]);
const p2 = Buffer.from([9, 9]);
const trailer = Buffer.from('grpc-status:0');
const buf = Buffer.concat([frame(0x00, p1), frame(0x00, p2), frame(0x80, trailer)]);
const msgs = unframe(buf);
check('boc dung 2 message (bo qua trailer)', msgs.length === 2);
check('message dau dung noi dung', msgs[0].equals(p1));
check('message thu hai dung noi dung', msgs[1].equals(p2));
check('buffer rong → mang rong, khong throw', unframe(Buffer.alloc(0)).length === 0);

console.log('\n--- readVarint: giai ma so nguyen khong dau kieu protobuf ---');
check('1 byte < 128 → gia tri chinh no', readVarint(Buffer.from([5]), 0)[0] === 5n);
check('varint nhieu byte (300 = 0xAC 0x02) → 300', readVarint(Buffer.from([0xac, 0x02]), 0)[0] === 300n);

console.log('\n--- scan: gom epoch hop le (1.5e9-4e9) va so thuc float/double ---');
function encodeVarintField(fieldNum, value) {
  const key = (fieldNum << 3) | 0; // wire type 0 = varint
  const bytes = [key];
  let v = BigInt(value);
  while (v > 0x7fn) { bytes.push(Number(v & 0x7fn) | 0x80); v >>= 7n; }
  bytes.push(Number(v));
  return Buffer.from(bytes);
}
const epochMsg = encodeVarintField(1, 1893456000); // moc thoi gian hop le trong tuong lai
const acc = { epochs: [], numbers: [] };
scan(epochMsg, acc, 0);
check('so trong khoang epoch hop le (1.5e9-4e9) duoc gom vao epochs', acc.epochs.includes(1893456000));

const smallNum = encodeVarintField(1, 5); // qua nho, khong phai epoch hop le
const acc2 = { epochs: [], numbers: [] };
scan(smallNum, acc2, 0);
check('so qua nho (khong phai epoch) KHONG bi gom nham vao epochs', acc2.epochs.length === 0);

check('depth qua sau (>6) thi dung lai, khong de quy vo han', (() => {
  const acc3 = { epochs: [], numbers: [] };
  scan(Buffer.from([0]), acc3, 10); // depth=10 > 6 → return ngay, khong xu ly gi
  return acc3.epochs.length === 0 && acc3.numbers.length === 0;
})());

console.log('\n--- readFieldPath: doc dung truong theo DUONG DAN, khong vo bua so dau tien ---');
// message gia: field 1 la mot message long, ben trong co field 1 = float 5.0
const innerFloat = Buffer.alloc(5);
innerFloat[0] = (1 << 3) | 5; // field 1, wire type 5 (32-bit)
innerFloat.writeFloatLE(5.0, 1);
const outerKey = (1 << 3) | 2; // field 1, wire type 2 (length-delimited)
const outer = Buffer.concat([Buffer.from([outerKey, innerFloat.length]), innerFloat]);
check('doc dung field [1,1] la float long trong submessage', readFieldPath(outer, [1, 1]) === 5);
check('duong dan khong khop (field 2 khong ton tai) → null', readFieldPath(outer, [2, 1]) === null);
check('buffer rong → null, khong throw', readFieldPath(Buffer.alloc(0), [1, 1]) === null);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n❌ ${fail} ca sai` : '\n✅ tất cả đạt');
process.exit(fail ? 1 : 0);
