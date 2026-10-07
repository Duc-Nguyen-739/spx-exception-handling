const { test } = require('node:test');
const assert = require('node:assert');

// KHỚP index.html: visibleItems + dateOnly_ + renderFilterControls_.
// Panel Bộ lọc màn chính: mã (nhập) · loại (Box/Item) · ngày tạo Từ–Đến ·
// người tạo (chọn) · mô tả (nhập) — AND với pills/sidebar sẵn có.
function dateOnly(iso) {
  const m = String(iso || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
}

function parseCreated(s) {
  const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
}

function matchFilter(it, f) {
  const fc = (f.fltCode || '').toLowerCase();
  if (fc && String(it.code).toLowerCase().indexOf(fc) < 0) return false;
  const fd = (f.fltDesc || '').toLowerCase();
  if (fd && String(it.description || '').toLowerCase().indexOf(fd) < 0) return false;
  if (f.fltKind && it.kind !== f.fltKind) return false;
  if (f.fltBy && String(it.createdBy || '').trim() !== f.fltBy) return false;
  if (f.fltFrom || f.fltTo) {
    const pd = parseCreated(it.createdAt);
    if (!pd) return false;
    const day = new Date(pd.getFullYear(), pd.getMonth(), pd.getDate()).getTime();
    if (f.fltFrom) { const fr = dateOnly(f.fltFrom); if (fr != null && day < fr) return false; }
    if (f.fltTo) { const to = dateOnly(f.fltTo); if (to != null && day > to) return false; }
  }
  return true;
}

const A = { code: 'Box.06-10-2026.1', kind: 'Box', createdAt: '06/10/2026 09:00:00', createdBy: 'a@spx.vn', description: 'Thùng áo thun' };
const B = { code: 'Item.07-10-2026.2', kind: 'Item', createdAt: '07/10/2026 10:00:00', createdBy: 'b@spx.vn', description: 'Giày hoàn' };
const BLANK = { fltCode: '', fltKind: '', fltFrom: '', fltTo: '', fltBy: '', fltDesc: '' };

test('filter-granular: trống = qua hết', () => {
  assert.ok(matchFilter(A, BLANK));
  assert.ok(matchFilter(B, BLANK));
});

test('filter-granular: mã + mô tả lọc chứa, không phân biệt hoa thường', () => {
  assert.ok(matchFilter(A, { ...BLANK, fltCode: 'box.06' }));
  assert.ok(!matchFilter(B, { ...BLANK, fltCode: 'box.06' }));
  assert.ok(matchFilter(A, { ...BLANK, fltDesc: 'ÁO THUN' }));
  assert.ok(!matchFilter(B, { ...BLANK, fltDesc: 'ÁO THUN' }));
});

test('filter-granular: loại Box/Item', () => {
  assert.ok(matchFilter(A, { ...BLANK, fltKind: 'Box' }));
  assert.ok(!matchFilter(B, { ...BLANK, fltKind: 'Box' }));
});

test('filter-granular: khoảng ngày Từ–Đến theo ngày (bỏ giờ)', () => {
  assert.ok(matchFilter(A, { ...BLANK, fltFrom: '2026-10-06', fltTo: '2026-10-06' }));
  assert.ok(!matchFilter(B, { ...BLANK, fltFrom: '2026-10-06', fltTo: '2026-10-06' }));
  assert.ok(matchFilter(B, { ...BLANK, fltFrom: '2026-10-07' }));
  assert.ok(matchFilter(A, { ...BLANK, fltTo: '2026-10-06' }));
});

test('filter-granular: người tạo khớp chính xác', () => {
  assert.ok(matchFilter(A, { ...BLANK, fltBy: 'a@spx.vn' }));
  assert.ok(!matchFilter(B, { ...BLANK, fltBy: 'a@spx.vn' }));
});

test('filter-granular: panel đủ 5 control + wiring trong index.html', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  for (const s of ['filterPanel', 'fltCode', 'fltKind', 'fltFrom', 'fltTo', 'fltBy', 'fltDesc', 'btnClearFilter', 'renderFilterControls_']) {
    assert.ok(html.includes(s), 'thiếu ' + s);
  }
});
