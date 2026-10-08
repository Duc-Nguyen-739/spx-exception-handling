const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');

// Chạy inline <script> của index.html với DOM + GAS giả để bắt lỗi runtime
// (sai ID, sai tên hàm, render timeline, luồng Resolve/Edit).
function makeEnv(fakeItem, fakeHistory) {
  fakeItem = JSON.parse(JSON.stringify(fakeItem));
  fakeHistory = JSON.parse(JSON.stringify(fakeHistory));
  const orig = { desc: fakeItem.description, note: fakeItem.note };
  const registry = {};
  const calls = [];
  function makeEl() {
    const el = {
      value: '', textContent: '', innerHTML: '', className: '', disabled: false,
      style: {}, children: [], onclick: null, onchange: null,
      appendChild(c) { this.children.push(c); return c; },
      addEventListener() {}, focus() {}, click() {},
      querySelector() { return makeEl(); }, querySelectorAll() { return []; },
      getAttribute(k) { return this['@' + k]; },
      setAttribute(k, v) { this['@' + k] = v; },
    };
    const cls = new Set();
    el.classList = {
      add(c) { cls.add(c); }, remove(c) { cls.delete(c); },
      toggle(c, f) {
        if (f === undefined) { if (cls.has(c)) cls.delete(c); else cls.add(c); }
        else if (f) cls.add(c); else cls.delete(c);
      },
      contains(c) { return cls.has(c); },
    };
    el._has = (c) => cls.has(c);
    return el;
  }
  let okCb = null;
  let errCb = null;
  const run = {
    withSuccessHandler(h) { okCb = h; return run; },
    withFailureHandler(h) { errCb = h; return run; },
    getOk() { return okCb; },
    fireErr(e) { errCb(e); },
    listItems() { calls.push(['listItems']); okCb({ ok: true, data: [] }); },
    getItem(code) {
      calls.push(['getItem', code]);
      okCb({ ok: true, data: { item: fakeItem, history: fakeHistory } });
    },
    resolveItem(code, bill) {
      calls.push(['resolveItem', code, bill]);
      okCb({ ok: true, data: {} });
    },
    editItem(p) {
      calls.push(['editItem', p]);
      const notes = [];
      if (p.description != null && String(p.description) !== String(orig.desc)) notes.push('Edit Mô tả: ' + orig.desc + ' => ' + p.description);
      if (p.note != null && String(p.note) !== String(orig.note)) notes.push('Edit Ghi chú: ' + orig.note + ' => ' + p.note);
      if (p.description != null) { fakeItem.description = String(p.description); orig.desc = String(p.description); }
      if (p.note != null) { fakeItem.note = String(p.note); orig.note = String(p.note); }
      notes.forEach((n) => fakeHistory.push({ at: '06/10/2026 18:22:00', code: p.code, from: fakeItem.status, to: fakeItem.status, by: 'son.nguyenngoc@spxexpress.com', note: n, bill: '', reason: '' }));
      okCb({ ok: true, data: { code: p.code } });
    },
    adminEditItem(p) {
      calls.push(['adminEditItem', p]);
      okCb({ ok: true, data: { code: p.code } });
    },
    me() {
      calls.push(['me']);
      okCb({ ok: true, data: { email: 'a@spxexpress.com', role: 'ADMIN' } });
    },
  };
  const listeners = {};
  const sandbox = {
    document: {
      getElementById(id) { if (!registry[id]) registry[id] = makeEl(); return registry[id]; },
      createElement() { return makeEl(); },
      querySelectorAll() { return []; },
      documentElement: makeEl(),
      body: makeEl(),
    },
    window: { addEventListener(t, fn) { listeners[t] = fn; } },
    localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } },
    google: { script: { run } },
    console,
  };
  sandbox.window.listeners = listeners;
  vm.createContext(sandbox);
  const html = fs.readFileSync('index.html', 'utf8');
  const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(src, sandbox, { filename: 'index-inline.js' });
  return { sandbox, registry, calls, listeners, run };
}

const ITEM = {
  code: 'Box.05-10-2026.1', kind: 'Box', createdAt: '10/05/2026 19:14:27',
  createdBy: 'duc.nguyenvan05@spxexpress.com', imgOuter: '', imgProduct: '',
  description: 'Thùng 12 áo thun', note: 'Kệ B2', status: 'chua_xu_ly',
  statusLabel: 'Lưu kho', bill: '', days: 148, extras: [], slots: [],
};
const HIST = [
  { at: '06/10/2026 17:51:00', code: 'Box.05-10-2026.1', from: 'chua_xu_ly', to: 'thanh_ly', by: 'duc.nguyenvan05@spxexpress.com', note: 'SPXVN9', bill: 'SPXVN9' },
  { at: '06/10/2026 17:59:00', code: 'Box.05-10-2026.1', from: 'chua_xu_ly', to: 'chua_xu_ly', by: 'a@spxexpress.com', note: 'ADMIN chỉnh sửa Mô tả sản phẩm', bill: '' },
];

test('detail: timeline render đủ giờ·email·token·bill + mốc ADMIN', async () => {
  const { sandbox, registry, listeners } = makeEnv(ITEM, HIST);
  await listeners.DOMContentLoaded();
  await sandbox.openDetail('Box.05-10-2026.1');
  const h = registry.detailHist.innerHTML;
  assert.match(h, /17:51 ngày 06-10-2026/);
  assert.match(h, /duc\.nguyenvan05@spxexpress\.com/);
  assert.match(h, /st thanhly/);
  assert.match(h, /SPXVN9/);
  assert.match(h, /tl-bill/);
  assert.match(h, /ADMIN chỉnh sửa Mô tả sản phẩm/);
  assert.match(h, /17:59 ngày 06-10-2026/);
  assert.match(h, /st Resolve|st "/);
  assert.strictEqual(registry.histCnt.textContent, 2);
  assert.match(registry.detailBody.innerHTML, /Chi tiết|Box\.05-10-2026\.1/);
});

test('detail: fmtAt đổi dd\/MM\/yyyy HH:mm:ss sang HH:MM ngày DD-MM-YYYY', async () => {
  const { sandbox, listeners } = makeEnv(ITEM, []);
  await listeners.DOMContentLoaded();
  assert.strictEqual(sandbox.fmtAt('06/10/2026 18:01:05'), '18:01 ngày 06-10-2026');
  assert.strictEqual(sandbox.stLabel('da_tim_bill'), 'Resolve');
  assert.strictEqual(sandbox.stLabel('thanh_ly'), 'Thanh Lý');
  assert.strictEqual(sandbox.stLabel('chua_xu_ly'), 'Lưu kho');
});

test('resolve: thiếu bill báo lỗi, đủ bill gọi server + ghi mốc kèm bill', async () => {
  const { sandbox, registry, calls, listeners } = makeEnv(ITEM, HIST);
  await listeners.DOMContentLoaded();
  await sandbox.openDetail('Box.05-10-2026.1');
  registry.resolveBill.value = '  ';
  await registry.btnConfirmResolve.onclick();
  assert.match(String(registry.msgDetail.textContent), /mã bill/);
  assert.ok(!calls.some((c) => c[0] === 'resolveItem'));
  registry.resolveBill.value = 'SPXVN123456789';
  await registry.btnConfirmResolve.onclick();
  const last = calls.filter((c) => c[0] === 'resolveItem').pop();
  assert.deepStrictEqual(last, ['resolveItem', 'Box.05-10-2026.1', 'SPXVN123456789']);
  assert.ok(calls.filter((c) => c[0] === 'getItem').length >= 2);
});

test('edit: ADMIN đổi trạng thái cần Lý do, mã optional; cùng lần lưu gộp 1 mốc', async () => {
  const item2 = { ...ITEM, status: 'da_tim_bill', statusLabel: 'Resolve' };
  const { sandbox, registry, calls, listeners, run } = makeEnv(item2, HIST);
  await listeners.DOMContentLoaded();
  await sandbox.openDetail('Box.05-10-2026.1');
  sandbox.openEdit();
  assert.ok(registry.editModal._has('open'));
  assert.strictEqual(registry.editDesc.value, 'Thùng 12 áo thun');
  assert.strictEqual(registry.editNote.value, 'Kệ B2');
  const labels = registry.editStatGrid.children.map((b) => b.textContent);
  assert.deepStrictEqual(labels, ['Lưu kho', 'Resolve', 'Thanh Lý']);
  const thanhLy = registry.editStatGrid.children[2];
  thanhLy.onclick();
  assert.strictEqual(registry.editBillWrap.style.display, 'block');
  assert.strictEqual(registry.editReasonWrap.style.display, 'block');
  // Có mã nhưng chưa điền lý do -> chặn
  registry.editBill.value = 'SPXVN777';
  await registry.btnConfirmEdit.onclick();
  assert.match(String(registry.msgEdit.textContent), /Lý do/);
  assert.ok(!calls.some((c) => c[0] === 'adminEditItem'));
  // Điền lý do, XÓA mã, đổi mô tả -> vẫn cho qua, payload bill rỗng
  registry.editBill.value = '   ';
  registry.editReason.value = 'Thao tác sai';
  registry.editDesc.value = 'Thùng 12 áo thun mới';
  run.adminEditItem = function (p) { calls.push(['adminEditItem', p]); /* treo để xem mốc pending */ };
  const p = registry.btnConfirmEdit.onclick();
  const eh = registry.detailHist.innerHTML;
  assert.match(eh, /ADMIN Edit:/);
  assert.match(eh, /Mô tả:/);
  assert.match(eh, /Đổi trạng thái:/);
  assert.match(eh, /Lý do:/);
  assert.match(eh, /Thao tác sai/);
  assert.match(eh, /1 lần lưu/);
  assert.strictEqual((eh.match(/<div class="tl[\s"]/g) || []).length, 3);
  assert.strictEqual(registry.histCnt.textContent, 3);
  const blocks = eh.split('<div class="tl');
  assert.ok(!/SPXVN|tl-bill/.test(blocks[blocks.length - 1]));
  run.getOk()({ ok: true, data: { code: 'Box.05-10-2026.1' } });
  await p;
  const last = calls.filter((c) => c[0] === 'adminEditItem').pop();
  assert.strictEqual(last[1].code, 'Box.05-10-2026.1');
  assert.strictEqual(last[1].toStatus, 'thanh_ly');
  assert.strictEqual(last[1].bill, '');
  assert.strictEqual(last[1].reason, 'Thao tác sai');
  assert.strictEqual(last[1].description, 'Thùng 12 áo thun mới');
  assert.match(String(registry.msgEdit.textContent), /Đã lưu/);
  assert.strictEqual(registry.editModal._has('open'), false);
});

test('timeline gộp: 3 log cùng at thành 1 mốc ADMIN Edit đúng thứ tự + bill 1 lần', async () => {
  const { sandbox, listeners } = makeEnv(ITEM, []);
  await listeners.DOMContentLoaded();
  const at = '08/10/2026 19:58:12';
  const list = [
    { at, code: 'Box.05-10-2026.1', from: 'chua_xu_ly', to: 'thanh_ly', by: 'ADMIN đổi trạng thái', note: 'SPXVN987654321', bill: 'SPXVN987654321', reason: 'Thao tác sai' },
    { at, code: 'Box.05-10-2026.1', from: 'thanh_ly', to: 'thanh_ly', by: 'duc.nguyenvan05', note: 'ADMIN Edit Mô tả: Testq => Test', bill: '', reason: '' },
    { at, code: 'Box.05-10-2026.1', from: 'thanh_ly', to: 'thanh_ly', by: 'duc.nguyenvan05', note: 'ADMIN chỉnh sửa Ảnh: Ảnh sản phẩm, Bổ sung 1', bill: '', reason: '' },
  ];
  const groups = sandbox.groupHist_(list);
  assert.strictEqual(groups.length, 1);
  const h = sandbox.groupHTML_(groups[0]);
  assert.match(h, /ADMIN Edit:/);
  assert.match(h, /3 thao tác · 1 lần lưu/);
  const iDesc = h.indexOf('Mô tả:'), iPhoto = h.indexOf('Chỉnh sửa ảnh:'), iSt = h.indexOf('Đổi trạng thái:');
  assert.ok(iDesc > 0 && iPhoto > iDesc && iSt > iPhoto);
  assert.match(h, /Ảnh sản phẩm, Bổ sung 1/);
  assert.match(h, /Lưu kho → Thanh Lý/);
  assert.match(h, /Lý do:.*Thao tác sai/);
  assert.match(h, /st thanhly/);
  assert.strictEqual(h.match(/tl-bill/g).length, 1);
  assert.match(h, /SPXVN987654321/);
});

test('timeline gộp: khác at tách mốc; STAFF head Edit + ẩn bill trống', async () => {
  const { sandbox, registry, listeners } = makeEnv(ITEM, []);
  await listeners.DOMContentLoaded();
  const a = '08/10/2026 19:58:12', b = '08/10/2026 20:01:44';
  assert.strictEqual(sandbox.groupHist_([
    { at: a, from: 'x', to: 'x', note: 'n1' }, { at: a, from: 'x', to: 'x', note: 'n2' }, { at: b, from: 'x', to: 'x', note: 'n3' },
  ]).length, 2);
  sandbox.state.detail = { item: ITEM, history: [
    { at: a, code: ITEM.code, from: 'chua_xu_ly', to: 'chua_xu_ly', by: 'son@spxexpress.com', note: 'Edit Mô tả: A => B', bill: '', reason: '' },
    { at: a, code: ITEM.code, from: 'chua_xu_ly', to: 'chua_xu_ly', by: 'son@spxexpress.com', note: 'Edit Ghi chú: C => D', bill: '', reason: '' },
  ] };
  sandbox.state.pending = {};
  sandbox.renderTimeline();
  assert.strictEqual(registry.histCnt.textContent, 1);
  const h = registry.detailHist.innerHTML;
  assert.match(h, /Edit:/);
  assert.match(h, /son@spxexpress\.com/);
  assert.ok(!h.includes('tl-bill'));
  assert.ok(!h.includes('ADMIN'));
});

test('timeline ma trận Mã/Lý do: cả 2 → hiện cả 2; 1 → hiện 1; 0 → ẩn cả', async () => {
  const { sandbox, listeners } = makeEnv(ITEM, []);
  await listeners.DOMContentLoaded();
  const st = (bill, reason) => ({ at: '08/10/2026 20:01:44', code: ITEM.code, from: 'chua_xu_ly', to: 'thanh_ly', by: 'ADMIN đổi trạng thái', note: bill, bill, reason });
  const both = sandbox.tlHTML(st('SPXVN1', 'Thao tác sai'));
  assert.match(both, /SPXVN1/);
  assert.match(both, /Lý do:/);
  const billOnly = sandbox.tlHTML(st('SPXVN1', ''));
  assert.match(billOnly, /SPXVN1/);
  assert.ok(!billOnly.includes('Lý do:'));
  const reasonOnly = sandbox.tlHTML(st('', 'Hàng vỡ'));
  assert.match(reasonOnly, /Hàng vỡ/);
  assert.ok(!reasonOnly.includes('tl-bill'));
  const grp = sandbox.groupHTML_(sandbox.groupHist_([
    { at: '08/10/2026 20:10:07', code: ITEM.code, from: 'thanh_ly', to: 'thanh_ly', by: 'a@x.com', note: 'ADMIN Edit Mô tả: A => B', bill: '', reason: '' },
    { at: '08/10/2026 20:10:07', code: ITEM.code, from: 'thanh_ly', to: 'thanh_ly', by: 'a@x.com', note: 'ADMIN chỉnh sửa Ảnh', bill: '', reason: '' },
  ])[0]);
  assert.match(grp, /Thanh Lý/);
  assert.ok(!grp.includes('tl-bill'));
  assert.ok(!grp.includes('Lý do:'));
});

test('timeline: STAFF hiện email + Edit cũ => mới; ADMIN hiện ADMIN Edit; lý do trống thì ẩn', async () => {
  const { sandbox, listeners } = makeEnv(ITEM, []);
  await listeners.DOMContentLoaded();
  const s = sandbox.tlHTML({ at: '10/06/2026 01:56:00', from: 'chua_xu_ly', to: 'chua_xu_ly', by: 'son.nguyenngoc@spxexpress.com', note: 'Edit Mô tả: Áo Cam => Áo xanh', bill: '', reason: '' });
  assert.match(s, /son\.nguyenngoc@spxexpress\.com/);
  assert.match(s, /Edit Mô tả: Áo Cam =&gt; Áo xanh/);
  const a = sandbox.tlHTML({ at: '10/06/2026 01:56:00', from: 'chua_xu_ly', to: 'chua_xu_ly', by: 'a@spxexpress.com', note: 'ADMIN Edit Mô tả: Áo Cam => Áo xanh', bill: '', reason: '' });
  assert.match(a, /ADMIN Edit Mô tả: Áo Cam =&gt; Áo xanh/);
  assert.ok(!a.includes('a@spxexpress.com'));
  const r = sandbox.tlHTML({ at: '06/10/2026 19:21:00', from: 'da_tim_bill', to: 'chua_xu_ly', by: 'ADMIN đổi trạng thái', note: '', bill: '', reason: 'Thao tác sai' });
  assert.match(r, /Lý do:/);
  assert.match(r, /Thao tác sai/);
  const r0 = sandbox.tlHTML({ at: '06/10/2026 19:21:00', from: 'da_tim_bill', to: 'chua_xu_ly', by: 'ADMIN đổi trạng thái', note: '', bill: '', reason: '' });
  assert.ok(!r0.includes('Lý do:'));
});

test('timeline: moc doi trang thai trong Edit hien ADMIN; moc nut thuong hien email', async () => {
  const { sandbox, listeners } = makeEnv(ITEM, []);
  await listeners.DOMContentLoaded();
  const h = sandbox.tlHTML({ at: '06/10/2026 03:32:00', from: 'da_tim_bill', to: 'chua_xu_ly', by: 'ADMIN đổi trạng thái', note: '', bill: '' });
  assert.match(h, /ADMIN đổi trạng thái/);
  assert.match(h, /tl-by admin/);
  assert.ok(!h.includes('@'));
  const h2 = sandbox.tlHTML({ at: '06/10/2026 18:01:00', from: 'chua_xu_ly', to: 'da_tim_bill', by: 'son.nguyenngoc@spxexpress.com', note: 'SPXVN1', bill: 'SPXVN1' });
  assert.match(h2, /son\.nguyenngoc@spxexpress\.com/);
  assert.ok(!/tl-by admin/.test(h2));
});

test('optimistic: timeline hien truoc tu cache, server ve sau van giu', async () => {
  const { sandbox, registry, calls, listeners, run } = makeEnv(ITEM, []);
  await listeners.DOMContentLoaded();
  await sandbox.openDetail('Box.05-10-2026.1');
  assert.match(registry.detailHist.innerHTML, /Chưa có/);
  let fire = null;
  run.resolveItem = function (code, bill) {
    calls.push(['resolveItem', code, bill]);
    const done = run.getOk();
    fire = function () { done({ ok: true, data: {} }); };
  };
  registry.resolveBill.value = 'SPXVN555';
  const p = registry.btnConfirmResolve.onclick();
  const h = registry.detailHist.innerHTML;
  assert.match(h, /SPXVN555/);
  assert.match(h, /pending/);
  assert.match(h, /st Resolve/);
  const css = fs.readFileSync('index.html', 'utf8');
  assert.match(css, /đang đồng bộ/);
  assert.match(registry.detailBody.innerHTML, /st Resolve/);
  fire();
  await p;
  assert.ok(calls.filter((c) => c[0] === 'getItem').length >= 2);
});

test('optimistic: server loi thi rollback + bao loi that', async () => {
  const { sandbox, registry, calls, listeners, run } = makeEnv(ITEM, []);
  await listeners.DOMContentLoaded();
  await sandbox.openDetail('Box.05-10-2026.1');
  run.resolveItem = function (code, bill) {
    calls.push(['resolveItem', code, bill]);
    run.fireErr(new Error('Rớt mạng giả lập'));
  };
  registry.resolveBill.value = 'SPXVN555';
  await registry.btnConfirmResolve.onclick();
  assert.match(String(registry.msgDetail.textContent), /Rớt mạng giả lập/);
  assert.ok(!registry.detailHist.innerHTML.includes('SPXVN555'));
});

test('detail: getItem loi thi hien loi that, khong nuot', async () => {
  const { sandbox, registry, listeners, run } = makeEnv(ITEM, []);
  await listeners.DOMContentLoaded();
  run.getItem = function () { run.fireErr(new Error('Không đọc được đơn')); };
  await sandbox.openDetail('Box.05-10-2026.1');
  assert.match(String(registry.msgDetail.textContent), /Không tải được chi tiết từ server/);
});

test('mergeHist: server co roi thi xoa pending, chua co thi giu', async () => {
  const { sandbox, listeners } = makeEnv(ITEM, []);
  await listeners.DOMContentLoaded();
  const e = { from: 'chua_xu_ly', to: 'da_tim_bill', bill: 'SPXVN1', note: 'SPXVN1' };
  assert.strictEqual(sandbox.mergeHist([], [e]).length, 1);
  assert.strictEqual(sandbox.mergeHist([{ ...e }], [e]).length, 1);
  assert.strictEqual(sandbox.mergeHist([{ ...e, bill: 'SPXVN2', note: 'SPXVN2' }], [e]).length, 2);
  assert.match(sandbox.nowClientStr(), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
});

test('edit: STAFF không thấy ô trạng thái/ảnh, chỉ sửa Mô tả + Ghi chú qua editItem', async () => {
  const { sandbox, registry, calls, listeners } = makeEnv(ITEM, HIST);
  await listeners.DOMContentLoaded();
  await sandbox.openDetail('Box.05-10-2026.1');
  sandbox.state.me = { email: 'son.nguyenngoc@spxexpress.com', role: 'STAFF' };
  sandbox.openEdit();
  assert.ok(registry.editModal._has('open'));
  assert.strictEqual(registry.editStatusWrap.style.display, 'none');
  assert.strictEqual(registry.editPhotosWrap.style.display, 'none');
  assert.strictEqual(registry.editStaffHint.style.display, 'block');
  // Không đổi gì -> không gọi server
  await registry.btnConfirmEdit.onclick();
  assert.match(String(registry.msgEdit.textContent), /Không có gì thay đổi/);
  assert.ok(!calls.some((c) => c[0] === 'editItem'));
  // Đổi mô tả -> gọi editItem, timeline hiện email + Edit cũ => mới
  registry.editDesc.value = 'Áo xanh';
  await registry.btnConfirmEdit.onclick();
  const last = calls.filter((c) => c[0] === 'editItem').pop();
  assert.strictEqual(last[1].code, 'Box.05-10-2026.1');
  assert.strictEqual(last[1].description, 'Áo xanh');
  assert.ok(!calls.some((c) => c[0] === 'adminEditItem'));
  const eh = registry.detailHist.innerHTML;
  assert.match(eh, /son\.nguyenngoc@spxexpress\.com/);
  assert.match(eh, /Edit Mô tả: Thùng 12 áo thun =&gt; Áo xanh/);
});

test('edit: ADMIN cũng thấy ô trạng thái trên đơn Lưu kho', async () => {
  const { sandbox, registry, listeners } = makeEnv(ITEM, HIST);
  await listeners.DOMContentLoaded();
  await sandbox.openDetail('Box.05-10-2026.1');
  sandbox.openEdit();
  assert.strictEqual(registry.editStatusWrap.style.display, 'block');
  assert.strictEqual(registry.editStaffHint.style.display, 'none');
});
