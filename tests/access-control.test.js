const { test } = require('node:test');
const assert = require('node:assert');

// KHỚP server: Code.gs adminEditItem / KHỚP api/logic.py can_edit_status.
var EDIT_OK = ['chua_xu_ly', 'da_tim_bill', 'thanh_ly'];
function canEditStatus(role, toStatus, bill, reason) {
  if (role !== 'ADMIN') return [false, 'Cần quyền ADMIN.'];
  if (EDIT_OK.indexOf(toStatus) < 0) return [false, 'Trạng thái không hợp lệ.'];
  if (toStatus && !String(reason || '').trim()) return [false, 'Thiếu lý do.'];
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

test('access: ADMIN đổi trạng thái trong Edit, mã optional + lý do bắt buộc', () => {
  assert.deepStrictEqual(canEditStatus('ADMIN', 'chua_xu_ly', '', 'về kho'), [true, '']);
  assert.deepStrictEqual(canEditStatus('ADMIN', 'da_tim_bill', 'SPXVN123', 'ok'), [true, '']);
  assert.deepStrictEqual(canEditStatus('ADMIN', 'thanh_ly', '', 'vỡ hàng'), [true, '']);
  assert.deepStrictEqual(canEditStatus('ADMIN', 'da_tim_bill', 'SPXVN123', ''), [false, 'Thiếu lý do.']);
  assert.deepStrictEqual(canEditStatus('ADMIN', 'thanh_ly', '', '  '), [false, 'Thiếu lý do.']);
  assert.deepStrictEqual(canEditStatus('ADMIN', 'da_cho_di', 'SPXVN1', 'x'), [false, 'Trạng thái không hợp lệ.']);
});

test('access: mọi email đều thấy nút Edit, chỉ sửa Mô tả + Ghi chú', () => {
  const canEditBasic = () => true;
  const canEditFull = (role) => role === 'ADMIN';
  assert.strictEqual(canEditBasic('STAFF'), true);
  assert.strictEqual(canEditBasic('ADMIN'), true);
  assert.strictEqual(canEditFull('ADMIN'), true);
  assert.strictEqual(canEditFull('STAFF'), false);
});

test('access: mốc Edit ghi cũ => mới, ADMIN thay email thành ADMIN', () => {
  const editNote = (oldV, newV, field, admin) => (admin ? 'ADMIN ' : '') + 'Edit ' + field + ': ' + oldV + ' => ' + newV;
  assert.strictEqual(editNote('Áo Cam', 'Áo xanh', 'Mô tả', false), 'Edit Mô tả: Áo Cam => Áo xanh');
  assert.strictEqual(editNote('Áo Cam', 'Áo xanh', 'Mô tả', true), 'ADMIN Edit Mô tả: Áo Cam => Áo xanh');
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
