const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// KHỚP client: index.html todayYMD_/ymdNum_/rangeDiff_/inRangeDay_/visibleItems.
// Display Range lọc danh sách theo ngày (fail-open khi thiếu range/không parse
// được); có chữ tìm kiếm thì bypass Range (không giới hạn ngày).
function ymdNum(o) { return o.y * 10000 + o.m * 100 + o.d; }
function rangeDiff(a, b) {
  return Math.round((new Date(b.y, b.m - 1, b.d) - new Date(a.y, a.m - 1, a.d)) / 86400000);
}
function codeDate(code) {
  let m = String(code || '').match(/^(?:Box|Item)\.(\d{2})-(\d{2})-(\d{4})\./);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  const o = String(code || '').match(/^(?:BOX|ITEM|TTC)\.(\d{2})(\d{2})(\d{4})\./i);
  if (o) return { y: +o[3], m: +o[2], d: +o[1] };
  return null;
}
function validYMD(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}
function parseSmart(s, code) {
  const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const vn = validYMD(+m[3], +m[2], +m[1]) ? [+m[3], +m[2], +m[1]] : null;
  const us = validYMD(+m[3], +m[1], +m[2]) ? [+m[3], +m[1], +m[2]] : null;
  const cd = codeDate(code);
  if (cd) {
    if (vn && vn[0] === cd.y && vn[1] === cd.m && vn[2] === cd.d) return vn;
    if (us && us[0] === cd.y && us[1] === cd.m && us[2] === cd.d) return us;
  }
  return vn || us;
}
function inRangeDay(createdAt, range, code) {
  const r = range;
  if (!r || !r.f || !r.t) return true;
  const p = parseSmart(createdAt, code);
  if (!p) return true;
  const n = p[0] * 10000 + p[1] * 100 + p[2];
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

test('range: don thang 10 phai nam trong range 30d mac dinh', () => {
  const r30 = { f: { y: 2026, m: 9, d: 8 }, t: { y: 2026, m: 10, d: 7 } };
  assert.strictEqual(inRangeDay('05/10/2026 19:05:51', r30), true);
  assert.strictEqual(inRangeDay('06/10/2026 18:39:00', r30), true);
  assert.strictEqual(inRangeDay('07/10/2026 13:49:30', r30), true);
});

test('range: chuoi dao ngay/thang (locale US) doi chieu ma van dung', () => {
  const r30 = { f: { y: 2026, m: 9, d: 8 }, t: { y: 2026, m: 10, d: 7 } };
  assert.deepStrictEqual(parseSmart('10/06/2026 18:39:00', 'Box.06-10-2026.2'), [2026, 10, 6]);
  assert.deepStrictEqual(parseSmart('10/05/2026 19:14:53', 'Box.05-10-2026.2'), [2026, 10, 5]);
  assert.strictEqual(inRangeDay('10/06/2026 18:39:00', r30, 'Box.06-10-2026.2'), true);
  assert.deepStrictEqual(parseSmart('06/10/2026 18:39:00', 'Box.06-10-2026.2'), [2026, 10, 6]);
  assert.deepStrictEqual(parseSmart('10/06/2026 18:39:00', 'Box.01-01-2026.9'), [2026, 6, 10]);
  assert.deepStrictEqual(parseSmart('25/10/2026 08:00:00', 'Box.06-10-2026.2'), [2026, 10, 25]);
  assert.strictEqual(parseSmart('khong-phai-ngay', 'Box.06-10-2026.2'), null);
});

test('range: nhan gon DD/MM/YYYY - DD/MM/YYYY, bo gio (KHOP index.html)', () => {
  const q = (n) => (n < 10 ? '0' : '') + n;
  const fmt = (a, b) => q(a.d) + '/' + q(a.m) + '/' + a.y + ' - ' + q(b.d) + '/' + q(b.m) + '/' + b.y;
  assert.strictEqual(fmt({ y: 2026, m: 9, d: 10 }, { y: 2026, m: 10, d: 9 }), '10/09/2026 - 09/10/2026');
  assert.strictEqual(fmt({ y: 2025, m: 12, d: 30 }, { y: 2026, m: 1, d: 5 }), '30/12/2025 - 05/01/2026');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes("function fmtRangeShort_(a,b){return fmtRange_(a,b);}"));
  const f1 = html.slice(html.indexOf('function fmtRange_('), html.indexOf('function fmtRangeShort_('));
  assert.ok(!f1.includes('00:00') && !f1.includes('23:59'), 'nhan range khong con gio');
});

test('range: lich tong diu + o tran thang khong to', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes(".rgcal td span.in{background:#fdf0e7;color:#a84a2a;"));
  assert.ok(html.includes('.rgcal td span.edge{background:#f97316;'));
  assert.ok(html.includes('.rgcal td span.today{outline:2px solid #7aa7f7;'));
  const i = html.indexOf('function rgBandCls(t,dim){');
  assert.ok(i > 0);
  const block = html.slice(i, html.indexOf('var TODAY_NUM'));
  assert.ok(block.includes("var r=dim?'dim':'';"));
  assert.ok(block.includes('if(dim)return r;'), 'o tran thang tra ve dim truoc moi overlay');
});

test('range-mobile-E: 2 dong + nut to, khong cuon ngang (KHOP mockup E)', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('<span class="rg-l1">') && html.includes('<span class="rg-l2">'), 'thieu wrap 2 dong');
  assert.ok(html.includes('#rangebar .rg-l1,#rangebar .rg-l2{display:contents}'), 'desktop phai giu 1 hang');
  assert.ok(html.includes('#rangebar .rg-l1{flex:1 1 100%}'), 'mobile dong 1 full-width');
  assert.ok(html.includes('#rangebar .rg-actions .create-big{padding:10px 14px;font-size:12.5px;border-radius:10px}'), 'sai co nut E');
});

test('range: co chu tim thi bypass (ke ca mo ta, khong gioi han ngay)', () => {
  const old = { code: 'Box.05-09-2026.9', description: 'Thùng tồn kho cần thanh lý', createdAt: '05/09/2026 08:00:00' };
  assert.strictEqual(visible(old, '', R30), false);
  assert.strictEqual(visible(old, 'thanh lý', R30), true);
  assert.strictEqual(visible(old, 'box.05-09', R30), true);
  assert.strictEqual(visible(old, 'khong co', R30), false);
});
