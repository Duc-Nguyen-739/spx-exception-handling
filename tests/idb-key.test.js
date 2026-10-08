const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract B2 key: thumb w400 va anh full KHONG chung key IDB.
// Cu: idbKeyOf('t'+id) == idbKeyOf(id) == id → lightbox ghi full de len thumb,
// lan mo sau load full vao moi o thumb → RAM phinh → iOS giet tab.

const HTML = fs.readFileSync('index.html', 'utf8');

test('idb-key: tach key thumb/full + migrate DB', () => {
  const i = HTML.indexOf('function idbKeyOf(k){');
  const b = HTML.slice(i, i + 160);
  assert.ok(b.includes("'_w400'"), 'thumb co hau to rieng');
  assert.ok(b.includes("'_full'"), 'full co hau to rieng');
  assert.ok(HTML.includes("indexedDB.open('spx-img',2)"), 'DB v2');
  const u = HTML.indexOf('onupgradeneeded=function(e){');
  assert.ok(u > 0 && HTML.slice(u, u + 400).includes('.clear()'), 'key cu tron thi xoa cache');
});

test('idb-key: moi cho doc/ghi IDB dung key moi', () => {
  assert.ok(HTML.includes("idbGet(idbKeyOf('t'+id))"), 'hydrate + fallback doc key thumb');
  assert.ok(HTML.includes("idbDel(idbKeyOf('t'+id))"), 'purge + truc xuat xoa key thumb');
  assert.ok(!HTML.includes('idbGet(id).then'), 'khong con doc key tran');
});
