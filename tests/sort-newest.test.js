const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Mirror client index.html: parseCreated (co giay) + seqOf_ + visibleItems sort desc.
function codeDate(code) {
  const m = String(code || '').match(/^(?:Box|Item)\.(\d{2})-(\d{2})-(\d{4})\./);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  return null;
}
function validYMD(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}
function parseCreated(s, code) {
  const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const hh = +(m[4] || 0), mi = +(m[5] || 0), ss = +(m[6] || 0);
  const vn = validYMD(+m[3], +m[2], +m[1]) ? new Date(+m[3], +m[2] - 1, +m[1], hh, mi, ss) : null;
  const us = validYMD(+m[3], +m[1], +m[2]) ? new Date(+m[3], +m[1] - 1, +m[2], hh, mi, ss) : null;
  const cd = codeDate(code);
  if (cd) {
    if (vn && vn.getFullYear() === cd.y && vn.getMonth() === cd.m - 1 && vn.getDate() === cd.d) return vn;
    if (us && us.getFullYear() === cd.y && us.getMonth() === cd.m - 1 && us.getDate() === cd.d) return us;
  }
  return vn || us;
}
function seqOf(code) {
  const m = String(code || '').match(/\.(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}
function sortNewest(list) {
  return list.slice().sort((a, b) => {
    const da = parseCreated(a.createdAt, a.code), db = parseCreated(b.createdAt, b.code);
    const ta = da ? da.getTime() : 0, tb = db ? db.getTime() : 0;
    if (tb !== ta) return tb - ta;
    return seqOf(b.code) - seqOf(a.code);
  });
}

test('sort-newest: moi nhat len dau du insertion order nguoc', () => {
  const items = [
    { code: 'Item.06-10-2026.2', createdAt: '06/10/2026 08:00:00' },
    { code: 'Item.06-10-2026.3', createdAt: '06/10/2026 09:00:00' },
    { code: 'Box.08-10-2026.1', createdAt: '08/10/2026 07:00:00' },
  ];
  const out = sortNewest(items);
  assert.strictEqual(out[0].code, 'Box.08-10-2026.1');
});

test('sort-newest: upsert append van sort len dau (mo phong Create)', () => {
  const cached = [
    { code: 'Box.05-10-2026.2', createdAt: '05/10/2026 08:00:00' },
    { code: 'Box.06-10-2026.1', createdAt: '06/10/2026 08:00:00' },
  ];
  cached.push({ code: 'Box.08-10-2026.1', createdAt: '08/10/2026 07:00:00' });
  const out = sortNewest(cached);
  assert.strictEqual(out[0].code, 'Box.08-10-2026.1');
});

test('sort-newest: cung phut khac giay thi giay lon hon dung truoc', () => {
  const out = sortNewest([
    { code: 'Box.08-10-2026.1', createdAt: '08/10/2026 07:00:05' },
    { code: 'Box.08-10-2026.2', createdAt: '08/10/2026 07:00:50' },
  ]);
  assert.strictEqual(out[0].code, 'Box.08-10-2026.2');
});

test('sort-newest: index.html visibleItems co sort desc + seq tie-break', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const i = html.indexOf('function visibleItems(){');
  assert.ok(i > 0);
  const block = html.slice(i, html.indexOf('return out;', i));
  assert.ok(block.includes('out.sort(function(a,b){'));
  assert.ok(block.includes('parseCreated(a.createdAt,a.code)'));
  assert.ok(block.includes('seqOf_(b.code)-seqOf_(a.code)'));
  assert.ok(html.includes('function seqOf_(code)'));
  assert.ok(html.includes('mi,ss):null'), 'parseCreated phai giu giay nhu server');
});

test('sort-newest: create_ van insert dau + doc cot A + batch Photos', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes('function nextSeqBothCodes_('));
  assert.ok(gs.includes('sh.getRange(2, 1, last - 1, 1).getValues()'));
  assert.ok(gs.includes('sh.insertRowBefore(2);'), 'giu insert dau sheet theo contract');
  const j = gs.indexOf('var phRows = jobs.map(');
  assert.ok(j > 0);
  assert.ok(gs.slice(j, j + 300).includes('.setValues(phRows)'));
});
