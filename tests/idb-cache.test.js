const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract cache anh 2 lop (KHOP index.html): memory photoCache (sync, session)
// + IndexedDB blob (async, song qua reload) — mo lai don cu hien ngay.
// Mirror logic thuan, khong can indexedDB that.

// KHOP index.html idbKeyOf.
function idbKeyOf(k) { if (!k) return ''; return (k.charAt(0) === 't') ? k.slice(1) + '_w400' : String(k) + '_full'; }

// KHOP index.html idbMemGet/idbMemPut (fallback + mirror, cap IDB_MAX=200).
function makeMemMax(limit) {
  const m = {}, order = [];
  return {
    get(id) { const e = m['i' + id]; return e ? e.blob : null; },
    put(id, blob, mime) {
      const k = 'i' + id;
      if (!blob || m[k]) return;
      m[k] = { blob, mime: mime || 'image/jpeg', at: Date.now() };
      order.push(k);
      while (order.length > limit) { const o = order.shift(); delete m[o]; }
    },
    size() { return order.length; },
  };
}

// KHOP index.html warmDetailImages: gom id thieu cache, toi da 3.
function collectWarmIds(urls, extractId, cached, max) {
  const ids = [];
  (urls || []).forEach((u) => {
    const id = extractId(u);
    if (id && !cached['t' + id] && ids.indexOf(id) < 0) ids.push(id);
  });
  return ids.slice(0, max);
}

// KHOP index.html idbQueue guards: chi persist data-URL, id hop le, chua co.
function queueGuard(u, id, memHas, pending) {
  if (!u || u.indexOf('data:') !== 0) return false;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return false;
  if (memHas || pending) return false;
  return true;
}

test('idb: index.html co store + hydrate + prime dung thu tu', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes("indexedDB.open('spx-img',2)"), 'DB v2 migrate key tron thumb/full');
  assert.ok(html.includes("createObjectStore('th',{keyPath:'id'})"));
  assert.ok(html.includes("createIndex('at','at'"));
  assert.ok(html.includes('function idbGet(id){'));
  assert.ok(html.includes('function idbPut(id,blob,mime){'));
  assert.ok(html.includes('function idbQueue(k,u){'));
  assert.ok(html.includes('function hydrateFromIdb(code){'));
  assert.ok(html.includes('try{primeImages_(it.code);}catch(e){}'), 'paint nao cung prime anh');
  const h = html.indexOf('function hydrateFromIdb(code){');
  const hb = html.slice(h, h + 1600);
  assert.ok(hb.includes("photoCache['t'+id]"), 'co cache memory thi bo qua');
  assert.ok(hb.includes("idbGet(idbKeyOf('t'+id))"), 'doc IDB theo key thumb');
  assert.ok(hb.includes('URL.createObjectURL(b)'), 'blob IDB thanh object-URL gan vao img');
  assert.ok(hb.includes('Promise.all'), 'hydrate tra Promise de prime await truoc khi warm');
  const p = html.indexOf('function putPhotoCache(k,u){');
  assert.ok(html.slice(p, p + 600).includes('idbQueue(k,u)'), 'moi anh server ve tu dong queue persist');
});

test('idb: key derive dung (tkhoa memory co prefix t)', () => {
  assert.strictEqual(idbKeyOf('tABC'), 'ABC_w400', 'thumb va full khong chung key');
  assert.strictEqual(idbKeyOf('ABC'), 'ABC_full');
  assert.strictEqual(idbKeyOf(''), '');
});

test('idb: memory mirror put/get + dedup + evict cu nhat', () => {
  const mem = makeMemMax(200);
  mem.put('A1', 'blob1');
  assert.strictEqual(mem.get('A1'), 'blob1');
  mem.put('A1', 'blobX');
  assert.strictEqual(mem.get('A1'), 'blob1', 'khong ghi de');
  mem.put('NOBLOB', null);
  assert.strictEqual(mem.get('NOBLOB'), null);
  for (let i = 0; i < 201; i++) mem.put('K' + i, 'b' + i);
  assert.strictEqual(mem.size(), 200);
  assert.strictEqual(mem.get('K0'), null, 'evict cu nhat');
  assert.strictEqual(mem.get('K200'), 'b200');
});

test('idb: warm chi tiet toi da 3 id, bo qua da cache + trung', () => {
  const urls = ['https://x/?id=ID1111111111', 'https://x/?id=ID2222222222', 'https://x/?id=ID1111111111', 'https://x/?id=ID3333333333', 'https://x/?id=ID4444444444'];
  const ex = (u) => (u.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || [])[1] || '';
  const out = collectWarmIds(urls, ex, { tID2222222222: 'data:x' }, 3);
  assert.deepStrictEqual(out, ['ID1111111111', 'ID3333333333', 'ID4444444444'].slice(0, 3));
});

test('idb: queue guard — chi data-URL id chuan chua co', () => {
  assert.strictEqual(queueGuard('data:image/jpeg;base64,/9j/', 'AbCdefGh12', false, false), true);
  assert.strictEqual(queueGuard('blob:https://x/1', 'AbCdefGh12', false, false), false, 'object-URL khong persist vong lap');
  assert.strictEqual(queueGuard('https://drive.google.com/thumbnail?id=X', 'AbCdefGh12', false, false), false);
  assert.strictEqual(queueGuard('data:image/jpeg;base64,/9j/', 'short', false, false), false);
  assert.strictEqual(queueGuard('data:image/jpeg;base64,/9j/', 'AbCdefGh12', true, false), false);
  assert.strictEqual(queueGuard('data:image/jpeg;base64,/9j/', 'AbCdefGh12', false, true), false);
});
