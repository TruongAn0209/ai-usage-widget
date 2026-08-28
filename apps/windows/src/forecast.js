// Du bao luc het quota.
// Y tuong: ghi lai % theo thoi gian cho tung han muc, do DOC (%/gio) bang hoi quy tuyen
// tinh tren cua so gan day, roi chieu toi moc 100%.
//
// ⚠️ Cai kho: nhieu han muc la CUA SO TRUOT — Claude 5 gio tu tut xuong khi de yen
// (da ghi trong memory: 35% -> 3%). Neu cu lay 2 diem bat ky ma tru nhau thi ra doc AM
// hoac doc ao khong lo. Nen:
//   - % TUT XUONG dang ke => coi nhu cua so da truot/reset => XOA lich su, dem lai tu dau.
//   - Chi du bao khi co du >=3 mau, trai >= MIN_SPAN_MS, va doc du lon (>MIN_RATE).
//   - Neu du bao cham 100% SAU luc reset => coi nhu an toan, khong hien gi (khong doa hao).
// Tha KHONG hien con hon hien mot con so bia (bai hoc: tung doan nguong sai gap 3 lan).

const WINDOW_MS = 45 * 60 * 1000; // chi dung mau trong 45 phut gan nhat
const MIN_SPAN_MS = 5 * 60 * 1000; // mau phai trai it nhat 5 phut
const MIN_SAMPLES = 3;
const MIN_RATE = 0.5; // %/gio — cham hon nay coi nhu dung yen, khong du bao
const DROP_RESET = 2; // tut qua 2 diem % => cua so da truot, quen lich su

// key -> [{ t, pct }]
const history = new Map();
// key -> resetAt cuoi cung thay (doi = cua so moi)
const lastReset = new Map();

function bucketsOf(providerList) {
  const out = [];
  for (const p of providerList || []) {
    if (!p || p.error) continue;
    const add = (name, pct, resetAt) => {
      if (pct === null || pct === undefined || !Number.isFinite(Number(pct))) return;
      out.push({ key: p.providerId + '|' + name, pct: Number(pct), resetAt: resetAt || null });
    };
    add('5h', p.fiveHourPct, p.fiveHourResetAt);
    add('weekly', p.weeklyPct, p.weeklyResetAt);
    for (const sc of p.scopedLimits || []) {
      if (sc.stale) continue; // so cu (vd agy da tat) khong dung de do doc
      add(sc.label || 'scoped', sc.pct, sc.resetAt);
    }
  }
  return out;
}

// Hoi quy tuyen tinh: tra ve doc theo %/gio
function slopePerHour(samples) {
  const n = samples.length;
  const t0 = samples[0].t;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const s of samples) {
    const x = (s.t - t0) / 3600000; // gio
    sx += x;
    sy += s.pct;
    sxx += x * x;
    sxy += x * s.pct;
  }
  const denom = n * sxx - sx * sx;
  if (!denom) return 0;
  return (n * sxy - sx * sy) / denom;
}

// Goi moi lan co so moi. Tra ve map { key: {etaMs, ratePerHour} } cho cac muc du bao duoc.
function update(providerList, now = Date.now()) {
  const result = {};
  const seen = new Set();

  for (const b of bucketsOf(providerList)) {
    seen.add(b.key);

    // Cua so moi (resetAt doi) -> lam lai tu dau
    const prevReset = lastReset.get(b.key);
    if (prevReset && b.resetAt && prevReset !== b.resetAt) history.delete(b.key);
    if (b.resetAt) lastReset.set(b.key, b.resetAt);

    let arr = history.get(b.key) || [];
    const last = arr[arr.length - 1];
    // Tut xuong = cua so truot/vua reset -> quen lich su cu, khong thi ra doc am
    if (last && b.pct < last.pct - DROP_RESET) arr = [];

    arr.push({ t: now, pct: b.pct });
    arr = arr.filter((s) => now - s.t <= WINDOW_MS);
    history.set(b.key, arr);

    if (arr.length < MIN_SAMPLES) continue;
    const span = arr[arr.length - 1].t - arr[0].t;
    if (span < MIN_SPAN_MS) continue;

    const rate = slopePerHour(arr);
    if (!Number.isFinite(rate) || rate < MIN_RATE) continue;
    if (b.pct >= 100) continue;

    const etaMs = now + ((100 - b.pct) / rate) * 3600000;
    // Se cham 100% SAU khi cua so reset -> khong phai lo, khong hien
    if (b.resetAt && etaMs > b.resetAt) continue;

    result[b.key] = { etaMs: Math.round(etaMs), ratePerHour: Math.round(rate * 10) / 10 };
  }

  // Don lich su cua muc da bien mat (tat AI, dong app)
  for (const k of Array.from(history.keys())) if (!seen.has(k)) history.delete(k);
  return result;
}

function reset() {
  history.clear();
  lastReset.clear();
}

module.exports = { update, reset, _slopePerHour: slopePerHour };
