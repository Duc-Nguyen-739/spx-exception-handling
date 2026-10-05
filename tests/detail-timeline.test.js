const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');

// Chạy inline <script> của index.html với DOM + GAS giả để bắt lỗi runtime
// (sai ID, sai tên hàm, render timeline, luồng Resolve/Edit).
function makeEnv(fakeItem, fakeHistory) {
  fakeItem = JSON.parse(JSON.stringify(fakeItem));
  fakeHistory = JSON.parse(JSON.stringify(fakeHistory));
  const registry = {};
  const calls = [];
  function makeEl() {
    const el = {
      value: '', textContent: '', innerHTML: '', className: '', disabled: false,
      style: {}, children: [], onclick: null, onchange: null,
      appendChild(c) { this.children.push(c); return c; },
      addEventListener() {}, focus() {}, click() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
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

test('edit: mở điền sẵn, đơn Resolve có 2 ô Lưu kho/Thanh Lý, bill bắt buộc', async () => {
  const item2 = { ...ITEM, status: 'da_tim_bill', statusLabel: 'Resolve' };
  const { sandbox, registry, calls, listeners } = makeEnv(item2, HIST);
  await listeners.DOMContentLoaded();
  await sandbox.openDetail('Box.05-10-2026.1');
  sandbox.openEdit();
  assert.ok(registry.editModal._has('open'));
  assert.strictEqual(registry.editDesc.value, 'Thùng 12 áo thun');
  assert.strictEqual(registry.editNote.value, 'Kệ B2');
  const labels = registry.editStatGrid.children.map((b) => b.textContent);
  assert.deepStrictEqual(labels, ['Lưu kho', 'Thanh Lý']);
  const thanhLy = registry.editStatGrid.children[1];
  thanhLy.onclick();
  assert.strictEqual(registry.editBillWrap.style.display, 'block');
  // Chưa điền bill -> chặn
  await registry.btnConfirmEdit.onclick();
  assert.match(String(registry.msgEdit.textContent), /mã bill/);
  assert.ok(!calls.some((c) => c[0] === 'adminEditItem'));
  // Điền bill + đổi mô tả -> gọi server đúng payload
  registry.editBill.value = 'SPXVN777';
  registry.editDesc.value = 'Thùng 12 áo thun mới';
  await registry.btnConfirmEdit.onclick();
  const last = calls.filter((c) => c[0] === 'adminEditItem').pop();
  assert.strictEqual(last[1].code, 'Box.05-10-2026.1');
  assert.strictEqual(last[1].toStatus, 'thanh_ly');
  assert.strictEqual(last[1].bill, 'SPXVN777');
  assert.strictEqual(last[1].description, 'Thùng 12 áo thun mới');
  assert.match(String(registry.msgEdit.textContent), /Đã lưu/);
  assert.strictEqual(registry.editModal._has('open'), false);
  const eh = registry.detailHist.innerHTML;
  assert.match(eh, /ADMIN đổi trạng thái/);
  assert.ok(!eh.includes('a@spxexpress.com'));
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

test('edit: đơn Lưu kho không có ô đổi trạng thái; không đổi gì thì không gọi server', async () => {
  const { sandbox, registry, calls, listeners } = makeEnv(ITEM, HIST);
  await listeners.DOMContentLoaded();
  await sandbox.openDetail('Box.05-10-2026.1');
  sandbox.openEdit();
  assert.strictEqual(registry.editStatusWrap.style.display, 'none');
  await registry.btnConfirmEdit.onclick();
  assert.match(String(registry.msgEdit.textContent), /Không có gì thay đổi/);
  assert.ok(!calls.some((c) => c[0] === 'adminEditItem'));
});
