const { test } = require('node:test');
const assert = require('node:assert');

// KHỚP server: Code.gs adminReopen/getRole_ / KHỚP api/logic.py can_admin_edit.
function canAdminEdit(status, role) {
  if (role !== 'ADMIN') return [false, 'Cần quyền ADMIN.'];
  if (status === 'chua_xu_ly') return [false, 'Đơn đang Lưu kho, không cần mở lại.'];
  return [true, ''];
}

test('access: STAFF bị khóa sau Hoàn Thành', () => {
  assert.deepStrictEqual(canAdminEdit('da_tim_bill', 'STAFF'), [false, 'Cần quyền ADMIN.']);
  assert.deepStrictEqual(canAdminEdit('thanh_ly', 'STAFF'), [false, 'Cần quyền ADMIN.']);
});

test('access: chỉ ADMIN được sửa task (kể cả đơn đã xong)', () => {
  const canEdit = (role) => role === 'ADMIN';
  assert.strictEqual(canEdit('ADMIN'), true);
  assert.strictEqual(canEdit('STAFF'), false);
});

test('access: ADMIN được mở lại, trừ đơn đang Lưu kho', () => {
  assert.deepStrictEqual(canAdminEdit('da_tim_bill', 'ADMIN'), [true, '']);
  assert.deepStrictEqual(canAdminEdit('thanh_ly', 'ADMIN'), [true, '']);
  assert.deepStrictEqual(canAdminEdit('chua_xu_ly', 'ADMIN'), [false, 'Đơn đang Lưu kho, không cần mở lại.']);
});
