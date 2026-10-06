const { test } = require('node:test');
const assert = require('node:assert');

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
