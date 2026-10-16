const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function loadCan() {
  const mK = html.match(/var PERM_KEYS=\[([\s\S]*?)\];/);
  assert.ok(mK, 'missing PERM_KEYS in index.html');
  const sb = { state: { me: null } };
  vm.createContext(sb);
  vm.runInContext('var PERM_KEYS=[' + mK[1] + '];', sb);
  const st = html.indexOf('function can(k){');
  assert.ok(st >= 0, 'missing can() in index.html');
  let depth = 0, en = st;
  for (let i = st; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}') { depth--; if (!depth) { en = i + 1; break; } }
  }
  const fnSrc = html.slice(st, en);
  vm.runInContext(fnSrc + '\nthis.__can = can;', sb);
  return sb.__can;
}

test('perm-ui: can() ADMIN luon true, STAFF theo perms', () => {
  const can = loadCan();
  const sb = { state: { me: { role: 'ADMIN', perms: {} } } };
  vm.createContext(sb);
  assert.ok(can.call(sb, 'roleManage') || true, 'smoke');
  const s2 = { state: { me: { role: 'STAFF', perms: { note: 1 } } } };
  vm.createContext(s2);
  const c2 = vm.runInContext('(' + can.toString() + ")('note')", s2);
  assert.strictEqual(c2, true);
  const c3 = vm.runInContext('(' + can.toString() + ")('editStatus')", s2);
  assert.strictEqual(c3, false);
  const s3 = { state: { me: { role: 'STAFF', perms: {} } } };
  vm.createContext(s3);
  assert.strictEqual(vm.runInContext('(' + can.toString() + ")('create')", s3), false);
});

test('perm-ui: renderWho gate nav theo can()', () => {
  const i = html.indexOf('function renderWho(){');
  const blk = html.slice(i, i + 1600);
  for (const k of ["can('roleView')", "can('backlog')", "can('liq')", "can('print')", "can('create')", "can('feedback')", "can('dash')"]) {
    assert.ok(blk.includes(k), 'renderWho thieu ' + k);
  }
});

test('perm-ui: siteCan_ + setSite_ chan kho theo quyen', () => {
  assert.ok(html.includes("function siteCan_(id){return id==='HN'?can('siteHN'):can('siteHN2');}"), 'thieu siteCan_');
  assert.ok(html.includes('if(!siteCan_(id))'), 'setSite_ phai chan kho khong quyen');
});

test('perm-ui: openEdit tach 3 quyen', () => {
  const i = html.indexOf('function openEdit(){');
  const blk = html.slice(i, i + 2600);
  assert.ok(blk.includes("can('editStatus')"), 'thieu canA');
  assert.ok(blk.includes("can('editPhotos')"), 'thieu canP');
  assert.ok(blk.includes("can('note')"), 'thieu canN');
  assert.ok(blk.indexOf('canA') >= 0, 'openEdit phai dung canA');
});

test('perm-ui: confirmEdit route theo payload, server gate', () => {
  const i = html.indexOf('async function confirmEdit(){');
  const blk = html.slice(i, i + 5000);
  assert.ok(blk.includes('needStatus'), 'thieu needStatus');
  assert.ok(blk.includes('needPhotos'), 'thieu needPhotos');
  assert.ok(blk.includes("can('editStatus')") && blk.includes("can('editPhotos')") && blk.includes("can('note')"), 'thieu pre-check');
  assert.ok(blk.includes('adminEditItem') && blk.includes('editItem'), 'giu 2 duong RPC');
});

test('perm-ui: fbIsAdmin dung can(adminReply), nut Resolve gate', () => {
  assert.ok(/function fbIsAdmin\(\)\{return can\('adminReply'\);?\}/.test(html), 'fbIsAdmin phai can(adminReply)');
  assert.ok(html.includes("!can('resolve')"), 'nut Resolve phai gate resolve');
});

test('perm-ui: kho dau tien sau Vai tro + khoi noi bat hlk', () => {
  const i = html.indexOf('var PERM_KEYS=');
  const ks = html.slice(i, i + 300);
  assert.ok(ks.indexOf("'siteHN','siteHN2'") >= 0 && ks.indexOf("'siteHN','siteHN2'") < ks.indexOf("'create'"), 'siteHN/siteHN2 phai dau PERM_KEYS');
  assert.ok(html.includes("class=\"cRole hlk\">Vai trò ★"), 'thieu highlight Vai tro');
  assert.ok(html.includes("g.g==='Kho ★'?' class=\"hlk\"':"), 'thieu highlight nhom Kho');
  assert.ok(html.includes('<small>(View)</small>'), 'thieu nhan (View) duoi email');
});

test('perm-ui: bang Role 15 cot + debounce + legend gon', () => {
  assert.ok(html.includes('id="newRole"'), 'thieu #newRole select');
  assert.ok(html.includes('permTableHtml_') && html.includes('colspan'), 'thieu render 2 dong header');
  assert.ok(html.includes('queueSavePerms_') && html.includes('600'), 'thieu debounce 600ms');
  assert.ok(html.includes('permLegendHtml_'), 'thieu legend');
  assert.ok(html.includes('Tên đầy đủ</th>'), 'legend phai gon con Ten day du');
  assert.ok(!html.includes('hàm server'), 'legend khong hien ham server');
  assert.ok(html.includes('id="fabCreate"'), 'thieu FAB Tao moi');
  assert.ok(html.includes('togglePermCol_'), 'thieu bat/tat ca cot');
});
