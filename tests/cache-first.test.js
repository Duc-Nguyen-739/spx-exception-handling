const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract B2 cache-first: mo lai don da xem → 0 call server.
// primeImages_ phai await hydrate IDB TRUOC khi warm; hit het thi return,
// khong goi refreshDetailUrls (mint tem) — mint tem sang B3 xoa han.

const HTML = fs.readFileSync('index.html', 'utf8');

test('cache-first: prime await hydrate, hit thi khong warm', () => {
  const p = HTML.indexOf('function primeImages_(code){');
  assert.ok(p > 0);
  const end = HTML.indexOf('function refreshDetailUrls', p);
  const b = HTML.slice(p, end > 0 ? end : p + 500);
  assert.ok(!b.includes('refreshDetailUrls'), 'khong mint tem moi lan mo');
  assert.ok(b.includes('p.then(go)'), 'await hydrate truoc khi warm');
  assert.ok(!HTML.includes('function warmIfMissing('), 'gop logic trung vao warmDetailImages');
  const w = HTML.indexOf('function warmDetailImages(code){');
  assert.ok(w > 0);
  const wb = HTML.slice(w, w + 700);
  assert.ok(wb.includes("!photoCache['t'+id]"), 'bo qua da cache');
  assert.ok(wb.includes('ids.slice(0,3)'), 'miss moi warm toi da 3');
});

test('cache-first: photoFallback kiem IDB truoc server', () => {
  const p = HTML.indexOf('function photoFallback(im,url,showNo){');
  assert.ok(p > 0);
  const b = HTML.slice(p, p + 700);
  assert.ok(b.includes("idbGet(idbKeyOf('t'+id))"), 'kiem tang 1 truoc');
  assert.ok(b.includes('URL.createObjectURL(b)'), 'hit thi hien ngay, 0 server');
  assert.ok(b.includes('fallbackToServer_'), 'miss moi xuong server');
  assert.ok(HTML.includes('function fallbackToServer_(im,src,showNo,id){'), 'tach server path rieng');
});

test('cache-first: capacity 600 cho 150 don x 1-3 anh', () => {
  assert.ok(HTML.includes('var IDB_MAX=600,'), 'IDB 600 thay vi 200');
  assert.ok(HTML.includes('photoCacheOrder.length>=600'), 'memory dong bo 600');
});

test('cache-first: luoi retry bang URL goc, IDB chi thu 1 lan', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('photoFallback(im,(orig&&orig!==src)?orig:src'), 'luoi truyen URL goc (co id), khong phai URL cached');
  assert.ok(html.includes('if(id&&!im.dataset.iq)'), 'IDB-hit co guard chong loop');
  assert.ok(html.includes("im.dataset.iq='1'"), 'danh dau sau 1 lan thu IDB');
});
