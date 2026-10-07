const { test } = require('node:test');
const assert = require('node:assert');

// KHỚP client: index.html todayYMD_/ymdNum_/rangeDiff_/inRangeDay_/visibleItems.
// Display Range lọc danh sách theo ngày (fail-open khi thiếu range/không parse
// được); có chữ tìm kiếm thì bypass Range (không giới hạn ngày).
function ymdNum(o) { return o.y * 10000 + o.m * 100 + o.d; }
function rangeDiff(a, b) {
  return Math.round((new Date(b.y, b.m - 1, b.d) - new Date(a.y, a.m - 1, a.d)) / 86400000);
}
function inRangeDay(createdAt, range) {
  const r = range;
  if (!r || !r.f || !r.t) return true;
  const m = String(createdAt || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return true;
  const n = (+m[3]) * 10000 + (+m[2]) * 100 + (+m[1]);
  return n >= ymdNum(r.f) && n <= ymdNum(r.t);
}
function visible(it, q, range) {
  if (!q) return inRangeDay(it.createdAt, range);
  const t = String(q).toLowerCase();
  return String(it.code).toLowerCase().includes(t)
    || String(it.description || '').toLowerCase().includes(t);
}

const R30 = { f: { y: 2026, m: 9, d: 8 }, t: { y: 2026, m: 10, d: 7 } };

test('range: trong/ngoai/bien + fail-open', () => {
  assert.strictEqual(inRangeDay('06/10/2026 08:02:00', R30), true);
  assert.strictEqual(inRangeDay('08/09/2026 00:00:00', R30), true);
  assert.strictEqual(inRangeDay('07/10/2026 23:59:00', R30), true);
  assert.strictEqual(inRangeDay('07/09/2026 10:00:00', R30), false);
  assert.strictEqual(inRangeDay('08/10/2026 10:00:00', R30), false);
  assert.strictEqual(inRangeDay('khong-phai-ngay', R30), true);
  assert.strictEqual(inRangeDay('', R30), true);
  assert.strictEqual(inRangeDay('06/10/2026 08:02:00', null), true);
  assert.strictEqual(inRangeDay('06/10/2026 08:02:00', { f: null, t: null }), true);
});

test('range: diff ngay cho preset/cap 60', () => {
  assert.strictEqual(rangeDiff({ y: 2026, m: 9, d: 8 }, { y: 2026, m: 10, d: 7 }), 29);
  assert.strictEqual(rangeDiff({ y: 2026, m: 8, d: 9 }, { y: 2026, m: 10, d: 7 }), 59);
  assert.strictEqual(rangeDiff({ y: 2026, m: 10, d: 7 }, { y: 2026, m: 10, d: 7 }), 0);
});

test('range: co chu tim thi bypass (ke ca mo ta, khong gioi han ngay)', () => {
  const old = { code: 'Box.05-09-2026.9', description: 'Thùng tồn kho cần thanh lý', createdAt: '05/09/2026 08:00:00' };
  assert.strictEqual(visible(old, '', R30), false);
  assert.strictEqual(visible(old, 'thanh lý', R30), true);
  assert.strictEqual(visible(old, 'box.05-09', R30), true);
  assert.strictEqual(visible(old, 'khong co', R30), false);
});
