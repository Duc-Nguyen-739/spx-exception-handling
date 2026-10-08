const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

// Nhiem doc blob: server getThumb/getThumbs tung tra ok() voi base64 cua
// trang HTML (thumbnail endpoint bo qua Bearer khi file chua share) ->
// client cache + persist IDB -> lan sau hydrate dung blob: URL tu rac ->
// anh chet voi [blob] thieu ma anh. Test khoa 3 cho:
// server chi tra image/*, client khong cache rac, hydrate purge rac cu.

function fnSrc(html, name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  let i = html.indexOf('{', start);
  let depth = 0, mode = 0;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (mode === 1) { if (c === '\\') j++; else if (c === "'") mode = 0; }
    else if (mode === 2) { if (c === '\\') j++; else if (c === '"') mode = 0; }
    else if (mode === 3) { if (c === '\\') j++; else if (c === '/') mode = 0; }
    else {
      if (c === "'") mode = 1;
      else if (c === '"') mode = 2;
      else if (c === '/') mode = 3;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
    }
  }
  throw new Error('unbalanced ' + name);
}

const GS = fs.readFileSync('Code.gs', 'utf8');
const HTML = fs.readFileSync('index.html', 'utf8');

test('photo-poison: server chi tra byte anh that (getPhoto/getThumb/getThumbs)', () => {
  const n = (GS.match(/indexOf\('image\/'\)/g) || []).length;
  assert.strictEqual(n, 3, 'ca 3 API anh deu gate image/*, hien co ' + n);
  const t = GS.slice(GS.indexOf('function getThumb('), GS.indexOf('function getThumbs('));
  assert.ok(t.includes("indexOf('image/') !== 0) return fail("), 'getThumb fail trung thuc thay vi ok rac');
  const b = GS.slice(GS.indexOf('function getThumbs('), GS.indexOf('function thumbOrder_('));
  assert.ok(b.includes("indexOf('image/') !== 0) { out[fid] = { error:"), 'getThumbs danh loi tung anh rac');
});

test('photo-poison: client khong cache payload khong phai anh', () => {
  const lib = ['putPhotoCache'].map((n) => fnSrc(HTML, n)).join('\n');
  const sandbox = {
    photoCache: {}, photoCacheOrder: [],
    URL: { revokeObjectURL: () => {} },
    idbQueue: () => { throw new Error('khong duoc queue rac'); },
    setTimeout, Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(lib, sandbox);
  vm.runInContext(`putPhotoCache('tx','data:text/html;base64,PGh0bWw+');`, sandbox);
  assert.deepStrictEqual(sandbox.photoCache, {}, 'rac text/html khong vao cache');
  vm.runInContext(`putPhotoCache('ty','data:image/png;base64,AAA');`, sandbox);
  assert.ok(sandbox.photoCache.ty, 'anh that van cache binh thuong');
});

test('photo-poison: hydrate purge blob rac va tu chua lanh', async () => {
  const lib = ['extractDriveId', 'putPhotoCache', 'hydrateFromIdb', 'swapCachedImgs', 'detailImgUrls_']
    .map((n) => fnSrc(HTML, n)).join('\n');
  const ID = 'MOCKouter01AB3456789012';
  const purged = [];
  const sandbox = {
    photoCache: {}, photoCacheOrder: [],
    idbMem_: {}, idbMemOrder_: [],
    idbDb: () => Promise.resolve(null),
    idbGet: () => Promise.resolve({ type: 'text/html' }),
    idbDel: (id) => { purged.push(id); },
    URL: {
      createObjectURL: () => { throw new Error('khong duoc dung URL tu rac'); },
      revokeObjectURL: () => {},
    },
    idbQueue: () => {},
    state: { detailCache: { C: { item: { imgOuter: 'https://drive.google.com/thumbnail?id=' + ID + '&sz=w400' } } } },
    document: { querySelectorAll: () => [] },
    setTimeout, Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(lib, sandbox);
  vm.runInContext(`hydrateFromIdb('C');`, sandbox);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepStrictEqual(purged, [ID], 'blob rac bi xoa khoi IDB');
  assert.deepStrictEqual(sandbox.photoCache, {}, 'khong dung blob URL tu rac');
});

test('photo-poison: blob anh that van hydrate binh thuong', async () => {
  const lib = ['extractDriveId', 'putPhotoCache', 'idbDel', 'hydrateFromIdb', 'swapCachedImgs', 'detailImgUrls_']
    .map((n) => fnSrc(HTML, n)).join('\n');
  const ID = 'MOCKouter01AB3456789012';
  const purged = [];
  const sandbox = {
    photoCache: {}, photoCacheOrder: [],
    idbMem_: {}, idbMemOrder_: [],
    idbDb: () => Promise.resolve(null),
    idbGet: () => Promise.resolve({ type: 'image/jpeg' }),
    idbDel: (id) => { purged.push(id); },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    idbQueue: () => {},
    state: { detailCache: { C: { item: { imgOuter: 'https://drive.google.com/thumbnail?id=' + ID + '&sz=w400' } } } },
    document: { querySelectorAll: () => [] },
    setTimeout, Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(lib, sandbox);
  vm.runInContext(`hydrateFromIdb('C');`, sandbox);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepStrictEqual(purged, [], 'khong xoa nham blob anh that');
  assert.strictEqual(sandbox.photoCache['t' + ID], 'blob:fake');
});

test('photo-poison: idbDel that don sach mem (KHOP index.html idbMem_)', () => {
  const lib = fnSrc(HTML, 'idbDel');
  const sandbox = {
    idbMem_: { iABC: { blob: 1 }, iXYZ: { blob: 2 } },
    idbMemOrder_: ['iABC', 'iXYZ'],
    idbDb: () => Promise.resolve(null),
    setTimeout, Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(lib, sandbox);
  vm.runInContext(`idbDel('ABC');`, sandbox);
  assert.deepStrictEqual(sandbox.idbMemOrder_, ['iXYZ']);
  assert.deepStrictEqual(Object.keys(sandbox.idbMem_), ['iXYZ']);
});
