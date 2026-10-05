const { test } = require('node:test');
const assert = require('node:assert');

// KHỚP server: Code.gs resolveItem/liquidateBatch / KHỚP api/logic.py.
function canResolve(status) {
  if (status === 'chua_xu_ly') return [true, ''];
  if (status === 'da_tim_bill') return [false, 'Đã Resolve'];
  if (status === 'thanh_ly') return [false, 'Đã Thanh Lý'];
  return [false, status];
}

function canLiquidate(status) {
  if (status === 'chua_xu_ly') return [true, ''];
  if (status === 'thanh_ly') return [false, 'Đã Thanh Lý'];
  if (status === 'da_tim_bill') return [false, 'Đã Resolve'];
  return [false, status];
}

function validLiqCode(s) {
  return /SPXVN[0-9A-Z]+/.test(String(s || '').toUpperCase());
}

test('status: resolve chỉ từ lưu kho', () => {
  assert.deepStrictEqual(canResolve('chua_xu_ly'), [true, '']);
  assert.deepStrictEqual(canResolve('da_tim_bill'), [false, 'Đã Resolve']);
  assert.deepStrictEqual(canResolve('thanh_ly'), [false, 'Đã Thanh Lý']);
});

test('status: thanh lý chặn resolve/thanh lý + trùng', () => {
  assert.deepStrictEqual(canLiquidate('chua_xu_ly'), [true, '']);
  assert.deepStrictEqual(canLiquidate('thanh_ly'), [false, 'Đã Thanh Lý']);
  assert.deepStrictEqual(canLiquidate('da_tim_bill'), [false, 'Đã Resolve']);
});

test('status: mã thanh lý bắt buộc chứa SPXVN', () => {
  assert.strictEqual(validLiqCode('SPXVN123'), true);
  assert.strictEqual(validLiqCode(''), false);
  assert.strictEqual(validLiqCode('hello'), false);
});
