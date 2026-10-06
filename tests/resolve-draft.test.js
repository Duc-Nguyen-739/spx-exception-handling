const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('vm');

// Harness inline index.html (giong detail-timeline.test.js) de tai hien race:
// mo don cached -> bam Resolve -> fetch nen ve -> form phai con.
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
    listItems() { calls.push(['listItems']); okCb({ ok: true, data: [] }); },
    getItem(code) {
      calls.push(['getItem', code]);
      okCb({ ok: true, data: { item: fakeItem, history: fakeHistory } });
    },
    resolveItem(code, bill) {
      calls.push(['resolveItem', code, bill]);
      okCb({ ok: true, data: {} });
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
  return { sandbox, registry, calls, listeners };
}

const ITEM = {
  code: 'Box.05-10-2026.1', kind: 'Box', createdAt: '10/05/2026 19:14:27',
  createdBy: 'a@spxexpress.com', imgOuter: 'o', imgProduct: 'p',
  description: 'Thung', note: '', status: 'chua_xu_ly',
  statusLabel: 'Lưu kho', bill: '', days: 1, extras: [], slots: [],
};

test('resolve-draft: fetch nen ve khong day form dang dien ra', async () => {
  const { sandbox, registry, listeners } = makeEnv(ITEM, []);
  await listeners.DOMContentLoaded();
  await sandbox.openDetail('Box.05-10-2026.1');
  await sandbox.openDetail('Box.05-10-2026.1');
  await registry.btnGoResolve.onclick();
  assert.strictEqual(registry.rsStep2.style.display, 'block');
  registry.resolveBill.value = 'SPXVN9';
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(registry.rsStep2.style.display, 'block');
  assert.strictEqual(registry.resolveBill.value, 'SPXVN9');
  assert.strictEqual(registry.btnGoResolve.style.display, 'none');
});

test('resolve-draft: Huy xoa draft, doi don khong lan form', async () => {
  const { sandbox, registry, listeners } = makeEnv(ITEM, []);
  await listeners.DOMContentLoaded();
  await sandbox.openDetail('Box.05-10-2026.1');
  await registry.btnGoResolve.onclick();
  await registry.btnCancelResolve.onclick();
  assert.strictEqual(registry.rsStep2.style.display, 'none');
  assert.strictEqual(sandbox.rsDraft.code, null);
});

test('resolve-draft: nut Quet an tren desktop + viewport khoa zoom', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('@media(min-width:900px){#camMain,#camLiq,#btnScanBill{display:none}}'));
  assert.ok(html.includes('maximum-scale=1'));
});
