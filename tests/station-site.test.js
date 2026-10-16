const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

// Contract station HN2/HN: 1 UI + SSOT ten sheet + site la tham so cuoi moi RPC doc/ghi.
const gs = fs.readFileSync('Code.gs', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

function occurrences(hay, needle) {
  return hay.split(needle).length - 1;
}

test('station-site: SSOT normSite_/sheetName_/getSheetFor_ dung 1 lan, khong trung', () => {
  assert.strictEqual(occurrences(gs, 'function normSite_('), 1);
  assert.strictEqual(occurrences(gs, 'function sheetName_('), 1);
  assert.strictEqual(occurrences(gs, 'function getSheetFor_('), 1);
  assert.ok(!gs.includes("getSheet_('Thumbs'"), 'khong doc/ghi sheet tem');
});

test('station-site: normSite_/sheetName_ map dung, la ve HN2', () => {
  const src = gs.slice(gs.indexOf('var SITE_SUFFIX_'), gs.indexOf('function getSheetFor_('));
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(src, sb);
  assert.strictEqual(vm.runInContext("normSite_('HN')", sb), 'HN');
  assert.strictEqual(vm.runInContext("normSite_('HN SOC')", sb), 'HN');
  assert.strictEqual(vm.runInContext("normSite_('HNSOC')", sb), 'HN');
  assert.strictEqual(vm.runInContext("normSite_('HN2 SOC')", sb), 'HN2');
  assert.strictEqual(vm.runInContext("normSite_('')", sb), 'HN2');
  assert.strictEqual(vm.runInContext("normSite_(undefined)", sb), 'HN2');
  assert.strictEqual(vm.runInContext("sheetName_('Items','HN')", sb), 'ItemsHNSOC');
  assert.strictEqual(vm.runInContext("sheetName_('Items','HN2')", sb), 'Items');
  assert.strictEqual(vm.runInContext("sheetName_('Backlog')", sb), 'Backlog');
  assert.strictEqual(vm.runInContext("sheetName_('Users','HN')", sb), 'Users');
  assert.strictEqual(vm.runInContext("sheetName_('Users','HN2')", sb), 'Users');
});

test('station-site: UI duoi logo 2 vi tri, menu khong co search', () => {
  assert.ok(html.includes('id="siteBtnHead"'), 'thieu nut header');
  assert.ok(html.includes('id="siteMenuHead"'), 'thieu menu header');
  assert.ok(html.includes('id="siteBtnSide"'), 'thieu nut sidebar');
  assert.ok(html.includes('id="siteMenuSide"'), 'thieu menu sidebar');
  for (const id of ['siteMenuHead', 'siteMenuSide']) {
    const menu = html.split('id="' + id + '"')[1].split('</div>')[0];
    assert.ok(menu.includes('data-site="HN"') && menu.includes('data-site="HN2"'), id + ' phai co 2 option');
    assert.ok(!menu.includes('<input'), id + ' khong co o search');
  }
  assert.ok(html.includes('id="siteToast"'), 'thieu toast');
});

test('station-site: toast 1 cau don gian, khong kem chi tiet sheet', () => {
  assert.ok(html.includes("siteToast_('Đã chuyển sang '+siteLabel_(id))"), 'toast phai 1 cau');
  assert.ok(html.includes("siteToast_('Bạn không có quyền truy cập '+siteLabel_(id)+'.')"), 'toast chan kho phai 1 cau');
  assert.strictEqual(occurrences(html, 'siteToast_('), 3, '1 dinh nghia + 2 call');
});

test('station-site: khong dung ten cam cua tram in', () => {
  for (const bad of ['viewStation', 'stationBtn', 'queueList', 'btnStation']) {
    assert.ok(!html.includes(bad), 'cam UI tram in: ' + bad);
  }
});

test('station-site: site mac dinh HN2, luu localStorage, paint truoc load', () => {
  assert.ok(html.includes("var siteCur='HN2'"), 'default phai HN2');
  assert.ok(html.includes("localStorage.getItem('spx_site')"), 'doc site da luu');
  assert.ok(html.includes("localStorage.setItem('spx_site',id)"), 'luu site khi doi');
  assert.ok(html.includes('paintSite_()'), 'paint label truoc load');
});

test('station-site: doi site xoa cache list + anh + liq', () => {
  const i = html.indexOf('async function setSite_(');
  assert.ok(i > 0, 'thieu setSite_');
  const b = html.slice(i, i + 2200);
  assert.ok(b.includes('state.items=[]'), 'xoa list');
  assert.ok(b.includes('blCache=null'), 'xoa backlog cache');
  assert.ok(b.includes('state.liq=[]'), 'xoa lo thanh ly chua gui');
  assert.ok(b.includes('photoCache={}'), 'xoa cache anh kho cu');
  assert.ok(b.includes("getElementById('grid')") && b.includes("innerHTML=''"), 'xoa luoi ngay khi doi site');
  assert.ok(b.includes('renderSummary()'), 'reset pills ngay khi doi site');
  assert.ok(b.includes("msg('msgMain','Đang tải"), 'hien Dang tai ngay khi doi site');
});

test('station-site: moi RPC sheet kem site cuoi args', () => {
  const pairs = [
    ['getThumb', '[id,800,siteCur]'], ['getThumbs', '[ch,400,siteCur]'],
    ['getPhoto', '[id,siteCur]'], ['getItem', '[code,siteCur]'],
    ['listFull', '[PAGE,off,siteCur]'], ['listItems', '[PAGE,off,siteCur]'],
    ['resolveItem', '[code,bill,siteCur]'], ['liquidateBatch', '[codes,liqCode,siteCur]'],
    ['previewBulkCodes', '[k,10,siteCur]'], ['listBacklog', '[siteCur]'],
    ['listFeedback', '[siteCur]'], ['addFeedback', '[v,siteCur]'],
    ['replyFeedback', '[id,v,siteCur]'], ['me', '[siteCur]'],
    ['listUsers', '[siteCur]'], ['enqueuePrintJob', '[codes,siteCur]'],
    ['pollPrintJobs', '[siteCur]'], ['ackPrintJob', "[job.job_id,true,'station printed',siteCur]"],
    ['deleteUser', '[email,siteCur]'], ['addAdmin', '[email,siteCur]'],
    ['diagIdentity', '[siteCur]'], ['fixPhotoSharing', '[guard>0,siteCur]'],
    ['auditPhotosOutsideFolder', '[next,siteCur]'],
  ];
  for (const [fn, args] of pairs) {
    assert.ok(html.includes("gs('" + fn + "'," + args + ')'), fn + ' thieu site cuoi args');
  }
  assert.ok(html.includes('customCode:customCode},siteCur]'), 'create thieu site');
  assert.ok(html.includes('note:noteV},siteCur]'), 'editItem thieu site');
  assert.ok(html.includes('reason:reason},siteCur]'), 'adminEditItem thieu site');
  assert.ok(html.includes("gs('claimPrintJob',[job.job_id,stationId_(),siteCur])"), 'claim thieu site');
});

test('station-site: anh check dung cay folder theo site', () => {
  assert.ok(gs.includes("site === 'HN' ? PROP_FOLDER_HN : PROP_FOLDER"), 'root theo site');
  assert.ok(gs.includes("'phok_' + fileId + '_' + site"), 'cache check theo site');
  assert.ok(gs.includes("'folder_' + site + '_' + name"), 'cache folder thang theo site');
  assert.ok(gs.includes('function getPhoto(fileId, site)'), 'getPhoto kem site');
  assert.ok(gs.includes('function getThumb(fileId, size, site)'), 'getThumb kem site');
  assert.ok(gs.includes('function getThumbs(ids, size, site)'), 'getThumbs kem site');
});
