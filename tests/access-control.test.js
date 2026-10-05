const { test } = require('node:test');
const assert = require('node:assert');

// KHỚP server: Code.gs adminEditItem / KHỚP api/logic.py can_edit_status.
var EDIT_OK = ['chua_xu_ly', 'da_tim_bill', 'thanh_ly'];
function canEditStatus(role, toStatus, bill) {
  if (role !== 'ADMIN') return [false, 'Cần quyền ADMIN.'];
  if (EDIT_OK.indexOf(toStatus) < 0) return [false, 'Trạng thái không hợp lệ.'];
  if ((toStatus === 'da_tim_bill' || toStatus === 'thanh_ly') && !String(bill || '').trim()) return [false, 'Thiếu mã bill.'];
  return [true, ''];
}

// KHỚP server: Code.gs billOf_ — chỉ mốc chuyển sang Resolve/Thanh Lý mới có dòng bill.
function historyBill(from, to, note) {
  if (from !== to && (to === 'da_tim_bill' || to === 'thanh_ly')) return String(note || '');
  return '';
}

test('access: STAFF không đổi trạng thái trong Edit', () => {
  assert.deepStrictEqual(canEditStatus('STAFF', 'chua_xu_ly', ''), [false, 'Cần quyền ADMIN.']);
  assert.deepStrictEqual(canEditStatus('STAFF', 'da_tim_bill', 'SPXVN1'), [false, 'Cần quyền ADMIN.']);
});

test('access: ADMIN đổi trạng thái trong Edit, bill bắt buộc khi sang Resolve/Thanh Lý', () => {
  assert.deepStrictEqual(canEditStatus('ADMIN', 'chua_xu_ly', ''), [true, '']);
  assert.deepStrictEqual(canEditStatus('ADMIN', 'da_tim_bill', 'SPXVN123'), [true, '']);
  assert.deepStrictEqual(canEditStatus('ADMIN', 'thanh_ly', 'SPXVN123'), [true, '']);
  assert.deepStrictEqual(canEditStatus('ADMIN', 'da_tim_bill', ''), [false, 'Thiếu mã bill.']);
  assert.deepStrictEqual(canEditStatus('ADMIN', 'thanh_ly', '  '), [false, 'Thiếu mã bill.']);
  assert.deepStrictEqual(canEditStatus('ADMIN', 'da_cho_di', 'SPXVN1'), [false, 'Trạng thái không hợp lệ.']);
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

test('timeline: chỉ mốc chuyển sang Resolve/Thanh Lý mới có dòng bill', () => {
  assert.strictEqual(historyBill('chua_xu_ly', 'da_tim_bill', 'SPXVN123'), 'SPXVN123');
  assert.strictEqual(historyBill('chua_xu_ly', 'thanh_ly', 'SPXVN9'), 'SPXVN9');
  assert.strictEqual(historyBill('', 'chua_xu_ly', 'Tạo mới'), '');
  assert.strictEqual(historyBill('da_tim_bill', 'da_tim_bill', 'ADMIN chỉnh sửa Mô tả sản phẩm'), '');
  assert.strictEqual(historyBill('da_tim_bill', 'chua_xu_ly', ''), '');
});
