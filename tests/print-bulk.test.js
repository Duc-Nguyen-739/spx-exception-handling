const { test } = require('node:test');
const assert = require('node:assert');

// KHỚP server: Code.gs previewBulkCodes/nextSeqBothCodes_ + api/logic.py bulk_codes.
// Client chỉ render dãy server trả về; test này khóa format + logic giữ chỗ.
const BULK_MAX = 10;

function seqNum(code, prefix) {
  const c = String(code || '');
  if (!c.startsWith(prefix)) return 0;
  const n = parseInt(c.slice(prefix.length), 10);
  return Number.isNaN(n) ? 0 : n;
}

function bulkCodes(existing, printed, kind, datePart, count) {
  const n = Math.min(Math.max(parseInt(count, 10) || 10, 1), BULK_MAX);
  const p = (kind === 'Item' ? 'Item.' : 'Box.') + datePart + '.';
  let best = 0;
  for (const c of existing || []) best = Math.max(best, seqNum(c, p));
  for (const c of printed || []) best = Math.max(best, seqNum(c, p));
  const out = [];
  for (let i = 0; i < n; i++) out.push(p + (best + 1 + i));
  return out;
}

test('print-bulk: sinh đúng 10 mã liên tục', () => {
  const got = bulkCodes(['Box.06-10-2026.1', 'Box.06-10-2026.2'], [], 'Box', '06-10-2026', 10);
  assert.strictEqual(got.length, 10);
  assert.strictEqual(got[0], 'Box.06-10-2026.3');
  assert.strictEqual(got[9], 'Box.06-10-2026.12');
});

test('print-bulk: nhảy qua mã đã giữ chỗ trong PrintedCodes', () => {
  const printed = Array.from({ length: 10 }, (_, i) => 'Box.06-10-2026.' + (i + 3));
  const got = bulkCodes(['Box.06-10-2026.1'], printed, 'Box', '06-10-2026', 10);
  assert.strictEqual(got[0], 'Box.06-10-2026.13');
});

test('print-bulk: count bị chặn 1..10', () => {
  assert.strictEqual(bulkCodes([], [], 'Item', '06-10-2026', 99).length, BULK_MAX);
  assert.strictEqual(bulkCodes([], [], 'Item', '06-10-2026', 0).length, BULK_MAX);
  assert.deepStrictEqual(bulkCodes([], [], 'Item', '06-10-2026', 3),
    ['Item.06-10-2026.1', 'Item.06-10-2026.2', 'Item.06-10-2026.3']);
});
