const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function extractKeys(src) {
  const m = src.match(/PERM_KEYS\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

function loadParse() {
  const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const mK = gs.match(/var PERM_KEYS\s*=\s*(\[[\s\S]*?\]);/);
  const mD = gs.match(/var PERM_DEFAULT\s*=\s*(\{[\s\S]*?\});/);
  assert.ok(mK, 'missing PERM_KEYS in Code.gs');
  assert.ok(mD, 'missing PERM_DEFAULT in Code.gs');
  const start = gs.indexOf('function parsePerms_(');
  assert.ok(start >= 0, 'missing parsePerms_');
  let depth = 0, end = start;
  for (let i = start; i < gs.length; i++) {
    if (gs[i] === '{') depth++;
    if (gs[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
  }
  const fnSrc = gs.slice(start, end);
  const sandbox = {
    PERM_KEYS: null, PERM_DEFAULT: null,
    Logger: { log: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(mK[0] + '\n' + mD[0], sandbox);
  vm.runInContext(fnSrc + '\nthis.__parse = parsePerms_;', sandbox);
  return sandbox.__parse;
}

const parse = loadParse();

test('perm-model: PERM_KEYS 4 noi giong het cung thu tu', () => {
  const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const py = fs.readFileSync(path.join(__dirname, '..', 'api', 'logic.py'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const mock = fs.readFileSync(path.join(__dirname, '..', 'mock', 'mock-google.js'), 'utf8');
  const a = extractKeys(gs);
  assert.ok(a && a.length === 15, 'Code.gs PERM_KEYS phai 15 key, got ' + JSON.stringify(a));
  assert.deepStrictEqual(extractKeys(py), a, 'api/logic.py phai giong Code.gs');
  assert.deepStrictEqual(extractKeys(html), a, 'index.html phai giong Code.gs');
  assert.deepStrictEqual(extractKeys(mock), a, 'mock/mock-google.js phai giong Code.gs');
});

test('perm-model: parsePerms_ trong -> mac dinh STAFF 10 bat 5 tat', () => {
  const o = parse('', 'STAFF');
  const on = Object.keys(o).filter((k) => o[k]);
  assert.strictEqual(on.length, 10);
  for (const k of ['create', 'resolve', 'liq', 'print', 'siteHN', 'siteHN2', 'dash', 'backlog', 'note', 'feedback']) assert.strictEqual(o[k], 1, k);
  for (const k of ['editStatus', 'editPhotos', 'adminReply', 'roleView', 'roleManage']) assert.strictEqual(o[k], 0, k);
});

test('perm-model: danh sach key rieng chi bat dung key', () => {
  const o = parse('create,liq', 'STAFF');
  assert.strictEqual(o.create, 1);
  assert.strictEqual(o.liq, 1);
  assert.strictEqual(o.resolve, 0);
  assert.strictEqual(Object.values(o).reduce((s, v) => s + v, 0), 2);
});

test('perm-model: NONE tat toan bo', () => {
  const o = parse('NONE', 'STAFF');
  assert.strictEqual(Object.values(o).reduce((s, v) => s + v, 0), 0);
});

test('perm-model: ADMIN luon 15/15', () => {
  const o = parse('', 'ADMIN');
  assert.strictEqual(Object.values(o).reduce((s, v) => s + v, 0), 15);
});

test('perm-model: key la bi bo qua', () => {
  const o = parse('create,bogus', 'STAFF');
  assert.strictEqual(o.create, 1);
  assert.strictEqual(Object.values(o).reduce((s, v) => s + v, 0), 1);
});

test('perm-model: chap nhan hoa + khoang trang', () => {
  const o = parse(' CREATE , liq ', 'STAFF');
  assert.strictEqual(o.create, 1);
  assert.strictEqual(o.liq, 1);
});

test('perm-model: USERS_HEADER 5 cot, perms cuoi', () => {
  const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const m = gs.match(/var USERS_HEADER\s*=\s*(\[[^\]]+\])/);
  assert.ok(m, 'missing USERS_HEADER');
  const arr = eval(m[1]);
  assert.strictEqual(arr.length, 5);
  assert.strictEqual(arr[4], 'perms');
});

test('perm-model: gate du key co RPC checkPerm_ (tru 3 key UI-only)', () => {
  const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const keys = extractKeys(gs);
  const uiOnly = ['siteHN', 'siteHN2', 'dash'];
  for (const k of keys) {
    if (uiOnly.includes(k)) continue;
    assert.ok(gs.includes("checkPerm_('" + k + "',"), 'thieu gate ' + k);
  }
});

test('perm-model: permsOf_ email la ve 0 het, seed ADMIN full', () => {
  const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  function fnSrc(name) {
    const start = gs.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'missing ' + name);
    let depth = 0, end = start;
    for (let i = start; i < gs.length; i++) {
      if (gs[i] === '{') depth++;
      if (gs[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
    }
    return gs.slice(start, end);
  }
  const mK = gs.match(/var PERM_KEYS\s*=\s*(\[[\s\S]*?\]);/);
  const mD = gs.match(/var PERM_DEFAULT\s*=\s*(\{[\s\S]*?\});/);
  const sb = {
    PERM_KEYS: null, PERM_DEFAULT: null,
    Logger: { log: () => {} },
    __rows: [],
    __seeds: [],
    __me: '',
  };
  vm.createContext(sb);
  vm.runInContext(mK[0] + '\n' + mD[0], sb);
  sb.normEmail_ = (s) => String(s || '').trim().toLowerCase();
  sb.cellText_ = (v) => (v == null ? '' : String(v));
  sb.currentEmail_ = () => sb.__me;
  sb.readUsers_ = () => ({ sh: null, rows: sb.__rows });
  sb.seedAdmins_ = () => sb.__seeds;
  vm.runInContext(fnSrc('parsePerms_') + '\n' + fnSrc('permsOf_') + '\n' + fnSrc('isKnownUser_'), sb);
  sb.__me = 'la.ngoai@x.com';
  const zero = vm.runInContext('permsOf_()', sb);
  assert.strictEqual(Object.values(zero).reduce((s, v) => s + v, 0), 0, 'email la phai 0 het');
  assert.strictEqual(vm.runInContext('isKnownUser_()', sb), false);
  sb.__rows = [['la.ngoai@x.com', 'STAFF', 't', 'b', 'create,liq']];
  const back = vm.runInContext('permsOf_()', sb);
  assert.strictEqual(back.create, 1);
  assert.strictEqual(back.liq, 1);
  assert.strictEqual(back.resolve, 0);
  assert.strictEqual(vm.runInContext('isKnownUser_()', sb), true);
  sb.__rows = [];
  sb.__seeds = ['la.ngoai@x.com'];
  const adm = vm.runInContext('permsOf_()', sb);
  assert.strictEqual(Object.values(adm).reduce((s, v) => s + v, 0), 15, 'seed ADMIN full');
  assert.strictEqual(vm.runInContext('isKnownUser_()', sb), true);
});

test('perm-model: readUsers_ dung ensureUsersHeader_', () => {
  const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  assert.ok(gs.includes('function ensureUsersHeader_('), 'missing ensureUsersHeader_');
  const i = gs.indexOf('function readUsers_(');
  const block = gs.slice(i, i + 600);
  assert.ok(block.includes('ensureUsersHeader_('), 'readUsers_ phai goi ensureUsersHeader_');
});

test('perm-model: parse camelCase khong phan biet hoa/thuong', () => {
  const o = parse('siteHN,siteHN2,editStatus,editPhotos,adminReply,roleView,roleManage', 'STAFF');
  for (const k of ['siteHN', 'siteHN2', 'editStatus', 'editPhotos', 'adminReply', 'roleView', 'roleManage']) assert.strictEqual(o[k], 1, k);
  const o2 = parse('SITEHN,EDITSTATUS,RoleView', 'STAFF');
  assert.strictEqual(o2.siteHN, 1);
  assert.strictEqual(o2.editStatus, 1);
  assert.strictEqual(o2.roleView, 1);
});
