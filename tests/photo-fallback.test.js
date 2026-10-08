const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// KHỚP client: index.html extractDriveId/photoFallback.
// Thumbnail hong -> tach fileId -> goi getPhoto dung 1 lan (dataset.sv)
// -> cache memory; server loi nua moi hien chu cu.
function extractDriveId(u) {
  const s = String(u || '');
  let m = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : '';
}

function shouldTryServer(url, tried) {
  const id = extractDriveId(url);
  if (id && !tried) return id;
  return '';
}

test('photo: tach id tu thumbnail ?id=', () => {
  assert.strictEqual(
    extractDriveId('https://drive.google.com/thumbnail?id=1AbCdefGhIjKlMnOp&sz=w400'),
    '1AbCdefGhIjKlMnOp'
  );
});

test('photo: tach id tu link /d/', () => {
  assert.strictEqual(
    extractDriveId('https://drive.google.com/file/d/1AbCdefGhIjKlMnOp/view'),
    '1AbCdefGhIjKlMnOp'
  );
});

test('photo: url la khong tach, data-url khong tach', () => {
  assert.strictEqual(extractDriveId(''), '');
  assert.strictEqual(extractDriveId('1AbCdefGhIjKlMnOp'), '');
  assert.strictEqual(extractDriveId('data:image/jpeg;base64,/9j/'), '');
});

test('photo: chi goi server 1 lan roi hien chu', () => {
  const url = 'https://drive.google.com/thumbnail?id=1AbCdefGhIjKlMnOp&sz=w400';
  assert.strictEqual(shouldTryServer(url, false), '1AbCdefGhIjKlMnOp');
  assert.strictEqual(shouldTryServer(url, true), '');
  assert.strictEqual(shouldTryServer('', false), '');
});

// KHOP index.html errText_ + photoFallback: loi server cuoi cung hien ra hop anh.
function errText(e) { return String((e && e.message) || e || '').trim(); }
function lastMsg(e1, e2) { return errText(e2) || errText(e1); }

test('photo: hop loi hien ly do server that, rong thi chu mac dinh', () => {
  assert.strictEqual(lastMsg(new Error('Không xem được ảnh.'), new Error('Ảnh quá lớn.')), 'Ảnh quá lớn.');
  assert.strictEqual(lastMsg(new Error('Không xem được ảnh.'), ''), 'Không xem được ảnh.');
  assert.strictEqual(lastMsg('', ''), '');
  const shown = (m) => m || 'Không tải được ảnh';
  assert.strictEqual(shown(lastMsg('', '')), 'Không tải được ảnh');
  assert.strictEqual(shown(lastMsg(new Error('x'), new Error('y'))), 'y');
});

test('photo: index.html truyen loi that ra 3 cho hien anh', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('function errText_(e){'));
  assert.ok(html.includes('done(errText_(e2)||errText_(e1))'));
  const n = (html.match(/esc\(msg\|\|'Không tải được ảnh'\)/g) || []).length;
  assert.strictEqual(n, 3, 'grid + chi tiet + edit deu hien ly do');
});

test('photo: khong con tem, chi data:/blob: moi fallback qua id goc', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(!html.includes("dataset.src='cell'"), 'bo swap tem');
  assert.ok(!html.includes("' (tem)'"), 'bo nhan tem khoi loi');
  assert.ok(html.includes('function cellDriveId_(im)'), 'giu helper id goc cho duong poison');
  assert.ok(html.includes('/^data:|^blob:/.test(src))id=cellDriveId_(im)'), 'chi data:/blob: moi lay id goc');
});

// KHOP index.html fallbackToServer_: src blob:/data: khong tach duoc id
// -> lay id tu wrapper data-url (url thumbnail goc) de chay lai serverThumb/serverPhoto.
function resolveCellId(src, dataUrl) {
  let id = extractDriveId(src);
  if (!id && /^data:|^blob:/.test(src)) id = extractDriveId(dataUrl);
  return id;
}

test('photo: blob/data hong thi fallback qua data-url, url la thi khong', () => {
  const blob = 'blob:https://localhost/poison';
  const orig = 'https://drive.google.com/thumbnail?id=1AbCdefGhIjKlMnOp&sz=w400';
  assert.strictEqual(resolveCellId(blob, orig), '1AbCdefGhIjKlMnOp');
  assert.strictEqual(resolveCellId('https://example.com/x.png', orig), '');
  assert.strictEqual(resolveCellId(blob, ''), '');
});
