const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Share 0/19: server khong cham duoc file nao. Khoa che 2 dang that bai
// (khong doc duoc file vs bi chan share) + SSOT tach ID (fileIdOf_)
// de link drive dang full URL khong lam lech allowlist/reshare.

// KHOP Code.gs fileIdOf_.
function fileIdOf(v) {
  const t = String(v == null ? '' : v).trim();
  if (/^[A-Za-z0-9_-]{10,}$/.test(t)) return t;
  let m = t.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  m = t.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : '';
}

test('photo-share: ID tran giu nguyen', () => {
  assert.strictEqual(fileIdOf('1AbCdefGhIjKlMnOp'), '1AbCdefGhIjKlMnOp');
  assert.strictEqual(fileIdOf('  1AbCdefGhIjKlMnOp  '), '1AbCdefGhIjKlMnOp');
});

test('photo-share: boc ID tu moi bien the link drive', () => {
  assert.strictEqual(fileIdOf('https://drive.google.com/thumbnail?id=1AbCdefGhIjKlMnOp&sz=w400'), '1AbCdefGhIjKlMnOp');
  assert.strictEqual(fileIdOf('https://drive.google.com/file/d/1AbCdefGhIjKlMnOp/view'), '1AbCdefGhIjKlMnOp');
  assert.strictEqual(fileIdOf('https://drive.google.com/uc?id=1AbCdefGhIjKlMnOp&export=view'), '1AbCdefGhIjKlMnOp');
});

test('photo-share: rac ve rong, khong lot URL la vao allowlist', () => {
  assert.strictEqual(fileIdOf(''), '');
  assert.strictEqual(fileIdOf('ngan'), '');
  assert.strictEqual(fileIdOf('Data_Images_Matbill/BOX.01.jpg'), '');
  assert.strictEqual(fileIdOf('https://www.appsheet.com/template/gettablefileurl?appName=x&fileName=y.jpg'), '');
});

const GS = fs.readFileSync('Code.gs', 'utf8');
const HTML = fs.readFileSync('index.html', 'utf8');

test('photo-share: SSOT fileIdOf_ dung chung, khong con pattern lech', () => {
  assert.strictEqual((GS.match(/function fileIdOf_\(/g) || []).length, 1);
  assert.ok(!GS.includes("trim() || driveIdFromUrl_("), 'khong con nhanh truthy-truoc-boc-sau');
  const uses = (GS.match(/fileIdOf_\(/g) || []).length;
  assert.ok(uses >= 6, 'helper + >=5 cho dung (photoIds 2 + reshare 3), hien co ' + uses);
});

test('photo-share: reshare phan loai that bai, khong nuot loi', () => {
  const b = GS.slice(GS.indexOf('function fixPhotoSharing('), GS.indexOf('function readPhotosAll_('));
  assert.ok(b.includes('unreadable'), 'dem file doc khong duoc (ID rac/quyen)');
  assert.ok(b.includes('blocked'), 'dem file bi chan share');
  assert.ok(b.includes('f = DriveApp.getFileById(fid)'), 'doc file tach rieng khoi doi share');
  assert.ok(b.includes('unreadable: acc.unreadable, blocked: acc.blocked'), 'tra breakdown cho client');
});

test('photo-share: UI hien breakdown de user bao lai dung benh', () => {
  assert.ok(HTML.includes('không đọc được file: '), 'hien so file doc khong duoc');
  assert.ok(HTML.includes('bị chặn share: '), 'hien so file bi chan share');
  assert.ok(HTML.includes('file của người khác: '), 'hien so file khong phai cua deployer');
  assert.ok(HTML.includes('hay gặp: '), 'hien mau loi gap nhieu nhat');
});

// KHOP Code.gs shareErrKind_: che email + ID dai, giu lai y chinh (<=120 ky tu).
function shareErrKind(e) {
  const m = String((e && e.message) || e || '')
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, '[EMAIL]')
    .replace(/[A-Za-z0-9_-]{25,}/g, '[ID]')
    .replace(/\s+/g, ' ').trim();
  return (m || 'unknown').slice(0, 120);
}

test('photo-share: mau loi che secret, giu y chinh', () => {
  assert.ok(!shareErrKind(new Error('File 1AbCdefGhIjKlMnOpQrStUvWxYz1234567 not found')).match(/[A-Za-z0-9_-]{25,}/), 'ID dai bi che');
  assert.strictEqual(shareErrKind(new Error('a@b.com x')), '[EMAIL] x');
  assert.ok(shareErrKind(new Error('Access denied: sharing outside org is disabled')).length <= 120);
});

test('photo-share: nut chan doan danh tinh chi doc, khong doi gi', () => {
  assert.strictEqual((GS.match(/function diagIdentity\(/g) || []).length, 1);
  const b = GS.slice(GS.indexOf('function diagIdentity('), GS.indexOf('function readPhotosAll_('));
  assert.ok(b.includes('requireAdmin_'), 'ADMIN only nhu reshare');
  assert.ok(b.includes('getSharingAccess()'), 'doc trang thai share hien tai thay vi doan');
  assert.ok(b.includes('getOwner()'), 'doc chu file de doi chieu deployer');
  assert.ok(!b.includes('setSharing'), 'tuyet doi khong doi share trong ham chan doan');
  assert.ok(HTML.includes('id="btnDiagId"'), 'co nut bam tren tab Role');
  assert.ok(HTML.includes("gs('diagIdentity',[])"), 'nut goi dung API');
  assert.ok(HTML.includes("getElementById('btnDiagId').onclick=diagId"), 'nut duoc gan handler');
});

test('photo-share: deploy trong thi bao chua ro chu, khong nhan vo la cua nguoi khac', () => {
  const b = GS.slice(GS.indexOf('function fixPhotoSharing('), GS.indexOf('function readPhotosAll_('));
  assert.ok(b.includes('unknownOwner'), 'dem rieng khi deployer email trong');
  assert.ok(b.includes('unknownOwner: acc.unknownOwner'), 'tra ve cho client');
  assert.ok(HTML.includes('chưa rõ chủ (deploy trống): '), 'UI hien dung truong hop');
});

test('photo-share: tab Role hien email deploy de doi chieu chu file', () => {
  assert.ok(GS.includes('deployer: deployerEmail_()'), 'me() tra deployer (effective user)');
  assert.ok(HTML.includes('Deploy: '), 'Role tab hien deployer canh email dang nhap');
  assert.ok(HTML.includes("(e.deployer||'(trống)')"), 'deployer trong van hien de phan biet 2 truong hop');
});

test('photo-share: reshare dem chu file + gom mau loi, khong lo ID moi', () => {
  const b = GS.slice(GS.indexOf('function fixPhotoSharing('), GS.indexOf('function readPhotosAll_('));
  assert.ok(b.includes('ownedByMe') && b.includes('ownedByOthers'), 'dem chu file theo deployer');
  assert.ok(b.includes('deployerEmail_()'), 'reuse ham deployer san co');
  assert.ok(b.includes('errTop'), 'tra mau loi gap nhieu nhat');
  assert.ok(b.includes('acc.failed.push(fid)'), 'failed chi push fid');
  assert.ok(b.includes('slice(0, 50)'), 'failed cat 50 de state vua property limit');
});

test('photo-share: domain-only, khong public, khong share per-file khi upload', () => {
  assert.ok(!GS.includes('ANYONE_WITH_LINK'), 'khong share public bat ky dau');
  const t = GS.slice(GS.indexOf('function tryShareFile_('), GS.indexOf('function monthFolder_('));
  assert.ok(t.includes('DOMAIN_WITH_LINK'), 'chi share domain');
  assert.ok(!t.includes('setSharing(DriveApp.Access.ANYONE'), 'khong thu public truoc');
  const cr = GS.slice(GS.indexOf('function create_('), GS.indexOf('function createBox('));
  assert.ok(!cr.includes('tryShareFile_'), 'upload ke thua share folder, khong set tung file');
});

test('photo-share: reshare cursor batch, khong timeout o 40-60k file', () => {
  assert.ok(GS.includes('var RESHARE_BATCH = 200;'), 'batch co dinh');
  const b = GS.slice(GS.indexOf('function fixPhotoSharing('), GS.indexOf('function readPhotosAll_('));
  assert.ok(b.includes('reshare_state'), 'cursor + state trong ScriptProperties');
  assert.ok(b.includes('order.slice(acc.i, acc.i + RESHARE_BATCH)'), 'moi call 1 batch');
  assert.ok(b.includes('deleteProperty'), 'xong thi don cursor');
  assert.ok(b.includes('done: done, processed: acc.i'), 'tra tien do cho client lap');
  assert.ok(HTML.includes("gs('fixPhotoSharing',[guard>0])"), 'client tu chay tiep den done');
});

test('photo-share: audit file ngoai folder chi doc, co cursor', () => {
  assert.strictEqual((GS.match(/function auditPhotosOutsideFolder\(/g) || []).length, 1);
  const b = GS.slice(GS.indexOf('function auditPhotosOutsideFolder('), GS.indexOf('function diagIdentity('));
  assert.ok(b.includes('requireAdmin_'), 'ADMIN only');
  assert.ok(b.includes('inPhotoFolder_'), 'reuse check folder O(1)');
  assert.ok(b.includes('AUDIT_BATCH'), 'batch co dinh, khong timeout');
  assert.ok(b.includes('done: done, next: next'), 'tra cursor cho client lap');
  assert.ok(!b.includes('setSharing'), 'tuyet doi khong doi share');
  assert.ok(!b.includes('setValues') && !b.includes('appendRow'), 'khong ghi sheet');
  assert.ok(HTML.includes('id="btnAuditPh"'), 'co nut tren tab Role');
  assert.ok(HTML.includes("gs('auditPhotosOutsideFolder',[next])"), 'client lap theo cursor');
  assert.ok(HTML.includes('miss+=(r.data.outsideCount||0)'), 'cong don file ngoai folder qua cac batch');
});
