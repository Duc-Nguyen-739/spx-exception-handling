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

test('access: xóa user — chặn tự xóa và ADMIN cuối', () => {
  const canDelete = (rows, target, me) => {
    if (target === me) return [false, 'Không tự xóa chính mình.'];
    const admins = rows.filter((r) => r[1] === 'ADMIN').length;
    const found = rows.find((r) => r[0] === target);
    if (!found) return [false, 'Email không có trong danh sách.'];
    if (found[1] === 'ADMIN' && admins <= 1) return [false, 'Không thể xóa ADMIN cuối cùng.'];
    return [true, ''];
  };
  const rows = [['a@x.com', 'ADMIN'], ['b@x.com', 'ADMIN']];
  assert.deepStrictEqual(canDelete(rows, 'b@x.com', 'a@x.com'), [true, '']);
  assert.deepStrictEqual(canDelete(rows, 'a@x.com', 'a@x.com'), [false, 'Không tự xóa chính mình.']);
  assert.deepStrictEqual(canDelete([['a@x.com', 'ADMIN']], 'a@x.com', 'z@x.com'), [false, 'Không thể xóa ADMIN cuối cùng.']);
});

test('access: ADMIN được mở lại, trừ đơn đang Lưu kho', () => {
  assert.deepStrictEqual(canAdminEdit('da_tim_bill', 'ADMIN'), [true, '']);
  assert.deepStrictEqual(canAdminEdit('thanh_ly', 'ADMIN'), [true, '']);
  assert.deepStrictEqual(canAdminEdit('chua_xu_ly', 'ADMIN'), [false, 'Đơn đang Lưu kho, không cần mở lại.']);
});
