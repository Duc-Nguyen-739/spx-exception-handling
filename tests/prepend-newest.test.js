const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract: moi dong moi insert o dau sheet (khong ghi cuoi).
// Mirror server Code.gs sortHistAsc_ + firstExtraMap_ earliest-pick.
function parseSmart(s) {
  const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return 0;
  const t = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return isNaN(t.getTime()) ? 0 : t.getTime();
}
function sortHistAsc(arr) {
  return arr.slice().sort((a, b) => parseSmart(a.at) - parseSmart(b.at));
}
function earliestExtra(rows) {
  let best = null, bestMs = Infinity;
  for (const r of rows) {
    if (r.slot === 'ngoai_quan' || r.slot === 'san_pham' || !r.url) continue;
    const ms = parseSmart(r.at);
    if (best === null || ms < bestMs) { best = r.url; bestMs = ms; }
  }
  return best;
}

test('prepend-newest: Code.gs khong con ghi cuoi (append/setValues tail)', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.strictEqual((gs.match(/appendRow/g) || []).length, 0, 'con appendRow');
  assert.strictEqual((gs.match(/getLastRow\(\) \+ 1/g) || []).length, 0, 'con ghi tail');
  assert.ok(gs.includes('function prependRows_(sh, rows)'));
  assert.ok(gs.includes('sh.insertRowsBefore(2, rows.length);'));
});

test('prepend-newest: history sort cu->moi du sheet tron 2 chieu', () => {
  const mixed = [
    { at: '08/10/2026 07:00:50' },
    { at: '05/10/2026 08:00:00' },
    { at: '06/10/2026 09:00:00' },
  ];
  const out = sortHistAsc(mixed);
  assert.deepStrictEqual(out.map((x) => x.at), [
    '05/10/2026 08:00:00',
    '06/10/2026 09:00:00',
    '08/10/2026 07:00:50',
  ]);
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes('function sortHistAsc_(arr, code)'));
  assert.ok(gs.includes('sortHistAsc_(histByCode[hk], hk)'));
  assert.ok(gs.includes('return sortHistAsc_(out, want);'));
});

test('prepend-newest: anh bo-sung lay ban som nhat (khong phu thuoc vi tri)', () => {
  const rows = [
    { slot: 'bo_sung', url: 'NEW', at: '08/10/2026 07:00:00' },
    { slot: 'bo_sung', url: 'OLD', at: '05/10/2026 08:00:00' },
  ];
  assert.strictEqual(earliestExtra(rows), 'OLD');
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes('bestAt[code]'), 'firstExtraMap_ phai chon theo gio som nhat');
  assert.ok(gs.includes('at: cellText_(vals[i][3])'), 'photosByCode_ phai kem uploaded_at de sort');
});
