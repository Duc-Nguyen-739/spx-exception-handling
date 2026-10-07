const { test } = require('node:test');
const assert = require('node:assert');

// KHỚP client: index.html codeValid_ — nút Sửa/Ok chỉ chốt mã đúng định dạng
// đầy đủ, prefix khớp loại form (Box form chỉ Box.).
function codeValid(kind, v) {
  v = String(v || '').trim();
  if (kind === 'Box') return /^Box\.\d{2}-\d{2}-\d{4}\.\d+$/.test(v);
  return /^Item\.\d{2}-\d{2}-\d{4}\.\d+$/.test(v);
}

test('code-edit: Box form chỉ nhận Box. đầy đủ', () => {
  assert.strictEqual(codeValid('Box', 'Box.07-10-2026.41'), true);
  assert.strictEqual(codeValid('Box', 'Box.07-10-2026.41 '), true);
  assert.strictEqual(codeValid('Box', 'Item.07-10-2026.41'), false);
  assert.strictEqual(codeValid('Box', 'Box.07-10-2026'), false);
  assert.strictEqual(codeValid('Box', 'Box.07-10-2026.'), false);
  assert.strictEqual(codeValid('Box', ''), false);
  assert.strictEqual(codeValid('Box', 'Box.(ngày-tháng-năm).(số tự sinh)'), false);
});

test('code-edit: Item form chỉ nhận Item. đầy đủ', () => {
  assert.strictEqual(codeValid('Item', 'Item.07-10-2026.51'), true);
  assert.strictEqual(codeValid('Item', 'Box.07-10-2026.51'), false);
  assert.strictEqual(codeValid('Item', 'Item.07-10-2026'), false);
  assert.strictEqual(codeValid('Item', ''), false);
});
