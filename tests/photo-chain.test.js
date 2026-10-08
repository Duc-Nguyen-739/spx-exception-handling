const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

// Behavioral test cho chuoi anh chi tiet, chay CODE THAT tu index.html
// (extractDriveId/cellDriveId_/useServerImg_/photoFallback/fallbackToServer_)
// voi DOM gia + server gia. Bao phu hoi quy dung bug report:
// direct hong -> getThumb -> (rac -> getPhoto) -> hien anh;
// blob rac -> truc xuat IDB -> tai lai qua server.

function fnSrc(html, name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  let i = html.indexOf('{', start);
  let depth = 0, mode = 0; // 0 code, 1 '...', 2 "...", 3 /.../
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (mode === 1) { if (c === '\\') j++; else if (c === "'") mode = 0; }
    else if (mode === 2) { if (c === '\\') j++; else if (c === '"') mode = 0; }
    else if (mode === 3) { if (c === '\\') j++; else if (c === '/') mode = 0; }
    else {
      if (c === "'") mode = 1;
      else if (c === '"') mode = 2;
      else if (c === '/') mode = 3; // cac ham nay khong co phep chia so hoc
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
    }
  }
  throw new Error('unbalanced ' + name);
}

const HTML = fs.readFileSync('index.html', 'utf8');
const REV = (HTML.match(/var APP_REV='([^']+)'/) || [])[1];
assert.ok(REV && /^r\d{8}[a-z]$/.test(REV), 'co APP_REV de truy vet ban build');
const WANT = ['extractDriveId', 'errText_', 'urlKind_', 'cellDriveId_', 'useServerImg_',
  'serverThumb', 'serverPhoto', 'idbKeyOf', 'photoFallback', 'fallbackToServer_'];
const LIB = WANT.map((n) => fnSrc(HTML, n)).join('\n');

function fakeImg(src, cell, origUrl, dataUrl) {
  const wrapper = { getAttribute: (k) => (k === 'data-url' ? (dataUrl || null) : null) };
  return {
    src, dataset: cell ? { src: 'cell', orig: origUrl || '', rt: '1' } : { rt: '1' },
    closest: () => wrapper, _wrapper: wrapper,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = { ok: { ok: true, data: { mime: 'image/png', b64: 'AAA' } } };
const JPG = { ok: { ok: true, data: { mime: 'image/jpeg', b64: 'BBB' } } };
const GARBAGE = { ok: { ok: true, data: { mime: 'text/html', b64: 'PGh0bWw+' } } };
const ID_A = 'MOCKouter01AB3456789012';
const THUMB_A = 'https://drive.google.com/thumbnail?id=' + ID_A + '&sz=w400';
const TEM_A = 'https://mock-content.local/Box.06-10-2026.1/ngoai_quan';
const TEM_REAL = 'https://lh3.googleusercontent.com/docs/ABCDEF=w320';

test('photo-chain: trich du code that, khong trich thieu', () => {
  assert.ok(LIB.includes('useServerImg_(im,id,u,showNo,done)'));
  assert.ok(LIB.includes("/^data:|^blob:/.test(src))id=cellDriveId_(im)"), 'chi blob/data hong moi lay id goc tu data-url');
  assert.ok(LIB.includes("im.dataset.fx='1'"), 'truc xuat doc 1 lan truoc khi tai lai');
  assert.ok(LIB.includes('/^data:image\\//'), 'payload server khong phai anh thi rot xuong getPhoto');
  assert.ok(LIB.includes('else{done();}'));
});

test('photo-chain: ma tran day du qua tung case doc lap', async () => {
  async function one(src, cell, origUrl, dataUrl, responses) {
    const calls = [];
    const sandbox = {
      photoCache: {}, photoLoading: {}, APP_REV: REV,
      putPhotoCache: () => {},
      idbGet: () => Promise.resolve(null),
      idbDel: () => {},
      URL: { createObjectURL: () => 'blob:mock' },
      state: { detail: { item: { code: 'X' } } },
      document: { querySelectorAll: () => [] },
      setTimeout, Promise,
      gs: (fn, args) => {
        calls.push([fn, args && args[0]]);
        const r = (responses[fn] || {})[args && args[0]];
        return new Promise((res, rej) => {
          setTimeout(() => {
            if (!r) rej(new Error('unexpected call'));
            else if (r.err) rej(new Error(r.err));
            else res(r.ok);
          }, 5);
        });
      },
    };
    vm.createContext(sandbox);
    const im = fakeImg(src, cell, origUrl, dataUrl);
    sandbox.im = im;
    let shown = 'UNSET';
    sandbox.showNo = (m) => { shown = m; };
    vm.runInContext(LIB, sandbox);
    vm.runInContext('photoFallback(im, undefined, showNo);', sandbox);
    await sleep(80);
    return { calls, src: sandbox.im.src, shown };
  }

  // 1. direct hong -> getThumb 1 lan -> hien anh, khong bao loi
  let r = await one(THUMB_A, false, '', THUMB_A, { getThumb: { [ID_A]: PNG } });
  assert.deepStrictEqual(r.calls, [['getThumb', ID_A]]);
  assert.ok(r.src.indexOf('data:image/png') === 0, 'hien anh tu server');
  assert.strictEqual(r.shown, 'UNSET');

  // 2. getThumb tra rac text/html -> rot xuong getPhoto -> hien anh
  r = await one(THUMB_A, false, '', THUMB_A, { getThumb: { [ID_A]: GARBAGE }, getPhoto: { [ID_A]: JPG } });
  assert.deepStrictEqual(r.calls, [['getThumb', ID_A], ['getPhoto', ID_A]]);
  assert.ok(r.src.indexOf('data:image/jpeg') === 0);

  // 3. ca 2 tang server loi -> hien loi that + loai link + rev, khong chung chung
  r = await one(THUMB_A, false, '', THUMB_A, {
    getThumb: { [ID_A]: { err: 'Không tải được ảnh.' } },
    getPhoto: { [ID_A]: { err: 'Không xem được ảnh.' } },
  });
  assert.deepStrictEqual(r.calls, [['getThumb', ID_A], ['getPhoto', ID_A]]);
  assert.ok(String(r.shown).indexOf('Không xem được ảnh.') >= 0);
  assert.ok(String(r.shown).indexOf('[drive]') >= 0, 'ro loai link drive');
  assert.ok(/r\d{8}[a-z]/.test(String(r.shown)), 'ro rev ban build');

  // 4. url la khong phai tem -> chan doan loai link + thieu ma anh, khong goi server
  r = await one('https://example.com/x.png', false, '', null, {});
  assert.deepStrictEqual(r.calls, []);
  assert.ok(String(r.shown).indexOf('[link]') >= 0);
  assert.ok(String(r.shown).indexOf('thiếu mã ảnh') >= 0);

  // 5. url googleusercontent khong tach duoc id -> chan doan [tem] + rev, khong goi server
  r = await one(TEM_REAL, false, '', '', {});
  assert.deepStrictEqual(r.calls, []);
  assert.ok(String(r.shown).indexOf('[tem]') >= 0);
  assert.ok(String(r.shown).indexOf('thiếu mã ảnh') >= 0);
  assert.ok(/r\d{8}[a-z]/.test(String(r.shown)));
});

test('photo-chain: phan loai link khong lo gia tri that', async () => {
  const sandbox = { setTimeout, Promise, APP_REV: REV };
  vm.createContext(sandbox);
  vm.runInContext(LIB, sandbox);
  const kinds = vm.runInContext(`JSON.stringify({
    drive: urlKind_('${THUMB_A}'),
    tem: urlKind_('https://lh3.googleusercontent.com/docs/ABCDEF=w320'),
    appsheet: urlKind_('https://www.appsheet.com/template/gettablefileurl?appName=x&fileName=y.jpg'),
    data: urlKind_('data:image/png;base64,AAA'),
    blob: urlKind_('blob:https://x/y'),
    link: urlKind_('https://example.com/x.png'),
    none: urlKind_('')
  })`, sandbox);
  assert.deepStrictEqual(JSON.parse(kinds), {
    drive: 'drive', tem: 'tem', appsheet: 'appsheet',
    data: 'data', blob: 'blob', link: 'link', none: 'trống',
  });
});

test('photo-chain: khong loop vo han khi anh server tra ve lai hong', async () => {
  const calls = [];
  const sandbox = {
    photoCache: {}, photoLoading: {}, APP_REV: REV,
    putPhotoCache: () => {},
    idbGet: () => Promise.resolve(null),
    idbDel: () => {},
    URL: { createObjectURL: () => 'blob:mock' },
    state: { detail: { item: { code: 'X' } } },
    document: { querySelectorAll: () => [] },
    setTimeout, Promise,
    gs: (fn, args) => {
      calls.push([fn, args && args[0]]);
      return new Promise((res) => {
        setTimeout(() => res({ ok: true, data: { mime: 'image/png', b64: 'AAA' } }), 5);
      });
    },
  };
  vm.createContext(sandbox);
  const im = fakeImg(THUMB_A, false, '', THUMB_A);
  sandbox.im = im;
  let shown = 'UNSET';
  sandbox.showNo = (m) => { shown = m; };
  vm.runInContext(LIB, sandbox);
  vm.runInContext('photoFallback(im, undefined, showNo);', sandbox);
  await sleep(80);
  assert.strictEqual(sandbox.im.dataset.sv, '1');
  vm.runInContext('photoFallback(im, undefined, showNo);', sandbox);
  await sleep(80);
  assert.strictEqual(sandbox.im.dataset.sv, '2');
  vm.runInContext('photoFallback(im, undefined, showNo);', sandbox);
  await sleep(30);
  assert.deepStrictEqual(calls, [['getThumb', ID_A], ['getPhoto', ID_A]]);
  assert.ok(shown !== 'UNSET', 'lan 3 dung lai va bao chu');
});

test('photo-chain: blob rac tu IDB duoc truc xuat roi tai lai qua server', async () => {
  const calls = [];
  const evicted = [];
  const sandbox = {
    photoCache: { ['t' + ID_A]: 'blob:poison', [ID_A]: 'blob:poison-full' },
    photoLoading: {},
    APP_REV: REV,
    putPhotoCache: () => {},
    idbGet: () => Promise.resolve(null),
    idbDel: () => {},
    URL: { createObjectURL: () => 'blob:mock' },
    idbDel: (id) => { evicted.push(id); },
    state: { detail: { item: { code: 'X' } } },
    document: { querySelectorAll: () => [] },
    setTimeout, Promise,
    gs: (fn, args) => {
      calls.push([fn, args && args[0]]);
      return new Promise((res) => {
        setTimeout(() => res({ ok: true, data: { mime: 'image/png', b64: 'AAA' } }), 5);
      });
    },
  };
  vm.createContext(sandbox);
  const im = fakeImg('blob:https://localhost/poison', false, '', THUMB_A);
  sandbox.im = im;
  let shown = 'UNSET';
  sandbox.showNo = (m) => { shown = m; };
  vm.runInContext(LIB, sandbox);
  vm.runInContext('photoFallback(im, undefined, showNo);', sandbox);
  await sleep(80);
  assert.deepStrictEqual(evicted, [ID_A + '_w400'], 'xoa ca cache lan IDB doc truoc khi tai lai');
  assert.deepStrictEqual(calls, [['getThumb', ID_A]], 'tai lai bang id goc tu data-url');
  assert.ok(sandbox.im.src.indexOf('data:image/png') === 0, 'hien anh moi tu server');
  assert.strictEqual(sandbox.im.dataset.fx, '1');
  assert.strictEqual(shown, 'UNSET');
});

test('photo-chain: truc xuat chi 1 lan, loi tiep thi dung khong loop', async () => {
  const calls = [];
  const sandbox = {
    photoCache: {}, photoLoading: {},
    APP_REV: REV,
    putPhotoCache: () => {},
    idbGet: () => Promise.resolve(null),
    idbDel: () => {},
    URL: { createObjectURL: () => 'blob:mock' },
    idbDel: () => {},
    state: { detail: { item: { code: 'X' } } },
    document: { querySelectorAll: () => [] },
    setTimeout, Promise,
    gs: (fn, args) => {
      calls.push([fn, args && args[0]]);
      return new Promise((res, rej) => {
        setTimeout(() => {
          if (fn === 'getThumb') res({ ok: true, data: { mime: 'text/html', b64: 'PGI+' } });
          else rej(new Error('Không xem được ảnh.'));
        }, 5);
      });
    },
  };
  vm.createContext(sandbox);
  const im = fakeImg('blob:https://localhost/poison', false, '', THUMB_A);
  sandbox.im = im;
  let shown = 'UNSET';
  sandbox.showNo = (m) => { shown = m; };
  vm.runInContext(LIB, sandbox);
  vm.runInContext('photoFallback(im, undefined, showNo);', sandbox);
  await sleep(80);
  vm.runInContext('photoFallback(im, undefined, showNo);', sandbox);
  await sleep(30);
  assert.deepStrictEqual(calls, [['getThumb', ID_A], ['getPhoto', ID_A]], 'khong goi them server o lan 2');
  assert.ok(String(shown).indexOf('[blob]') >= 0, 'bao dung loai link that');
});

test('photo-chain: IDB hit chi 1 lan, blob hong thi rot server khong loop', async () => {
  const calls = [];
  const sandbox = {
    photoCache: {}, photoLoading: {}, APP_REV: REV,
    putPhotoCache: (k, u) => { sandbox.photoCache[k] = u; },
    idbGet: () => Promise.resolve({ type: 'image/jpeg' }),
    idbDel: () => {},
    URL: { createObjectURL: () => 'blob:oneshot' },
    state: { detail: { item: { code: 'X' } } },
    document: { querySelectorAll: () => [] },
    setTimeout, Promise,
    gs: (fn, args) => {
      calls.push([fn, args && args[0]]);
      return new Promise((res) => {
        setTimeout(() => res({ ok: true, data: { mime: 'image/png', b64: 'AAA' } }), 5);
      });
    },
  };
  vm.createContext(sandbox);
  const im = fakeImg(THUMB_A, false, '', THUMB_A);
  sandbox.im = im;
  let shown = 'UNSET';
  sandbox.showNo = (m) => { shown = m; };
  vm.runInContext(LIB, sandbox);
  vm.runInContext('photoFallback(im, undefined, showNo);', sandbox);
  await sleep(80);
  assert.strictEqual(sandbox.im.src, 'blob:oneshot', 'lan 1: IDB hit hien ngay 0 server');
  assert.deepStrictEqual(calls, []);
  assert.strictEqual(sandbox.im.dataset.iq, '1', 'danh dau da thu IDB');
  vm.runInContext('photoFallback(im, undefined, showNo);', sandbox);
  await sleep(80);
  assert.deepStrictEqual(calls, [['getThumb', ID_A]], 'lan 2: bo qua IDB, di thang server');
  assert.ok(sandbox.im.src.indexOf('data:image/png') === 0, 'hien anh server, khong loop blob');
  assert.strictEqual(shown, 'UNSET');
});
