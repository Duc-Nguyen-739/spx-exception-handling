const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

// Contract preload: luoi preload TOAN BO anh cac don dang hien (khong chi
// 1 thumb/don) vao photoCache + IDB, mo chi tiet hien ngay 0 call server.
// Debounce + cap de khong dot quota GAS.

const HTML = fs.readFileSync('index.html', 'utf8');

test('visible-warm: gom du anh don dang hien, co cap + debounce', () => {
  const i = HTML.indexOf('function warmVisibleOrders(){');
  assert.ok(i > 0, 'co ham preload');
  const b = HTML.slice(i, i + 900);
  assert.ok(b.includes('visibleItems().slice(0,30)'), 'chi 30 don dau');
  assert.ok(b.includes('detailImgUrls_(it)'), 'lay DU anh (ngoai quan + san pham + bo sung)');
  assert.ok(b.includes("photoCache['t'+id]"), 'bo qua da cache');
  assert.ok(b.includes('ids.slice(0,90)'), 'cap 90 id/lan (~4 exec)');
  assert.ok(b.includes('warmPhotoCache(ids)'), 'di batch (vao cache + IDB)');
  assert.ok(b.includes('document.hidden'), 'an tab thi thoi');
  const s = HTML.indexOf('function scheduleVisibleWarm(){');
  assert.ok(s > 0 && HTML.slice(s, s + 300).includes('800'), 'debounce 800ms');
});

test('visible-warm: duoc goi sau render + tai them', () => {
  assert.ok(HTML.includes('scheduleVisibleWarm();}'), 'renderGrid xong thi schedule');
  assert.ok(HTML.includes('setTimeout(prefetchHeadThumbs,600);scheduleVisibleWarm();'), 'loadGrid (ca tai them) thi schedule');
});

test('visible-warm: hanh vi gom id thieu cache', () => {
  function fnSrc(name) {
    const s = HTML.indexOf('function ' + name + '(');
    assert.ok(s >= 0, 'missing ' + name);
    let i = HTML.indexOf('{', s), depth = 0;
    for (let j = i; j < HTML.length; j++) {
      if (HTML[j] === '{') depth++;
      if (HTML[j] === '}') { depth--; if (!depth) return HTML.slice(s, j + 1); }
    }
    throw new Error('unbalanced ' + name);
  }
  const lib = ['extractDriveId', 'detailImgUrls_', 'warmVisibleOrders'].map(fnSrc).join('\n');
  const A = 'IDAAA1111111111', B = 'IDBBB2222222222', C = 'IDCCC3333333333';
  const sandbox = {
    document: { hidden: false },
    photoCache: { ['t' + B]: 'cached' },
    visibleItems: () => [
      { imgOuter: 'https://drive.google.com/thumbnail?id=' + A + '&sz=w400', imgProduct: 'https://drive.google.com/thumbnail?id=' + B + '&sz=w400', extras: ['https://drive.google.com/thumbnail?id=' + C + '&sz=w400'] },
    ],
    warmed: null,
    warmPhotoCache: function (ids) { sandbox.warmed = JSON.parse(JSON.stringify(ids)); },
    setTimeout, Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(lib, sandbox);
  vm.runInContext('warmVisibleOrders()', sandbox);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.warmed)), [A, C], 'lay A + C, bo B da cache');
});
