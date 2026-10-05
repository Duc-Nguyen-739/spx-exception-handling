const { test } = require('node:test');
const assert = require('node:assert');

// KHỚP server: Code.gs prefix_ + todayPart_ / KHỚP api/logic.py CODE_RE.
const CODE_RE = /^(Box|Item)\.(\d{2})-(\d{2})-(\d{4})\.(\d+)$/;

function nextSeq(codes, prefix) {
  let best = 0;
  for (const c of codes) {
    if (c.startsWith(prefix)) {
      const n = parseInt(c.slice(prefix.length), 10);
      if (n > best) best = n;
    }
  }
  return best + 1;
}

test('id-format: Box/Item DD-MM-YYYY.seq', () => {
  assert.match('Box.01-10-2026.21', CODE_RE);
  assert.match('Item.01-10-2026.1', CODE_RE);
  assert.doesNotMatch('BOX.02032026.01', CODE_RE); // mã cũ vẫn đọc được, mã mới phải có gạch
  assert.doesNotMatch('Box.01-10-2026.0x', CODE_RE);
});

test('id-format: seq tự sinh theo ngày', () => {
  const codes = ['Box.01-10-2026.1', 'Box.01-10-2026.2', 'Box.02-10-2026.1'];
  assert.strictEqual(nextSeq(codes, 'Box.01-10-2026.'), 3);
  assert.strictEqual(nextSeq(codes, 'Box.02-10-2026.'), 2);
  assert.strictEqual(nextSeq([], 'Item.01-10-2026.'), 1);
});
