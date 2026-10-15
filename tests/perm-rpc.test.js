const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

function extractFn(name) {
  const start = gs.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  let depth = 0, end = start;
  for (let i = start; i < gs.length; i++) {
    if (gs[i] === '{') depth++;
    if (gs[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
  }
  return gs.slice(start, end);
}

function permSandbox(role, perms) {
  const mK = gs.match(/var PERM_KEYS\s*=\s*(\[[\s\S]*?\]);/);
  const mD = gs.match(/var PERM_DEFAULT\s*=\s*(\{[\s\S]*?\});/);
  const mL = gs.match(/var PERM_LABELS\s*=\s*(\{[\s\S]*?\});/);
  const sb = {
    PERM_KEYS: null, PERM_DEFAULT: null, PERM_LABELS: null,
    Logger: { log: () => {} },
    __role: role, __perms: perms,
  };
  vm.createContext(sb);
  vm.runInContext(mK[0] + '\n' + mD[0] + '\n' + mL[0], sb);
  vm.runInContext(extractFn('parsePerms_'), sb);
  sb.getRole_ = () => sb.__role;
  sb.currentPerms_ = () => sb.__perms;
  vm.runInContext(extractFn('checkPerm_'), sb);
  return sb;
}

test('perm-rpc: checkPerm_ cho qua khi co quyen', () => {
  const sb = permSandbox('STAFF', { create: 1 });
  vm.runInContext("checkPerm_('create')", sb);
});

test('perm-rpc: checkPerm_ throw dung thong bao khi thieu', () => {
  const sb = permSandbox('STAFF', { create: 0 });
  assert.throws(() => vm.runInContext("checkPerm_('create')", sb), /không có quyền/);
});

test('perm-rpc: ADMIN luon qua', () => {
  const sb = permSandbox('ADMIN', {});
  vm.runInContext("checkPerm_('roleManage')", sb);
});

function decideBranch(toStatus, cur, delN, addN) {
  const changingStatus = !!(toStatus && toStatus !== cur);
  const changingPhotos = (delN > 0 || addN > 0);
  const need = [];
  if (changingStatus) need.push('editStatus');
  if (changingPhotos) need.push('editPhotos');
  if (!changingStatus && !changingPhotos) need.push('note');
  return need;
}

test('perm-rpc: adminEditItem tach 3 quyen — STAFF doi status can editStatus', () => {
  assert.deepStrictEqual(decideBranch('thanh_ly', 'chua_xu_ly', 0, 0), ['editStatus']);
  const blk = extractFn('adminEditItem');
  assert.ok(blk.includes("checkPerm_('editStatus')"), 'missing editStatus gate');
});

test('perm-rpc: adminEditItem — chi mo ta can note', () => {
  assert.deepStrictEqual(decideBranch('', 'chua_xu_ly', 0, 0), ['note']);
  const blk = extractFn('adminEditItem');
  assert.ok(blk.includes("checkPerm_('note')"), 'missing note gate');
});

test('perm-rpc: adminEditItem — them anh can editPhotos', () => {
  assert.deepStrictEqual(decideBranch('', 'chua_xu_ly', 0, 1), ['editPhotos']);
  const blk = extractFn('adminEditItem');
  assert.ok(blk.includes("checkPerm_('editPhotos')"), 'missing editPhotos gate');
});

test('perm-rpc: adminEditItem — doi status + anh can ca hai', () => {
  assert.deepStrictEqual(decideBranch('thanh_ly', 'chua_xu_ly', 1, 0), ['editStatus', 'editPhotos']);
});

function runSetUserPerms(opts) {
  const writes = [];
  const sb = {
    PERM_KEYS: ['create', 'resolve', 'liq', 'print', 'note', 'editStatus', 'editPhotos', 'backlog', 'feedback', 'adminReply', 'roleView', 'roleManage'],
    PERM_DEFAULT: { create: 1 },
    PERM_LABELS: {},
    Logger: { log: () => {} },
    currentEmail_: () => opts.me,
    normEmail_: (s) => String(s || '').trim().toLowerCase(),
    cellText_: (v) => (v == null ? '' : String(v)),
    checkPerm_: () => {},
    withLock_: (fn) => fn(),
    parsePerms_: (str, role) => ({ _str: str, _role: role }),
    ok: (d) => ({ ok: true, data: d }),
    fail: (m) => ({ ok: false, error: m }),
    readUsers_: () => ({ sh: fakeSh, rows: opts.rows }),
  };
  const fakeSh = {
    getRange: (r, c) => ({
      setValues: (vals) => { writes.push({ r, c, vals }); },
    }),
  };
  vm.createContext(sb);
  vm.runInContext(extractFn('setUserPerms'), sb);
  const args = JSON.stringify([opts.email, opts.role, opts.keys]);
  const res = vm.runInContext('setUserPerms.apply(null,' + args + ')', sb);
  return { res, writes };
}

test('perm-rpc: setUserPerms tu tat roleView cua minh -> fail', () => {
  const { res } = runSetUserPerms({
    me: 'a@x.com', email: 'a@x.com', role: 'STAFF', keys: ['create'],
    rows: [['a@x.com', 'ADMIN', 't', 'b', '']],
  });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /xem trang Role/);
});

test('perm-rpc: setUserPerms ha ADMIN cuoi -> fail', () => {
  const { res } = runSetUserPerms({
    me: 'a@x.com', email: 'a@x.com', role: 'STAFF', keys: ['roleView'],
    rows: [['a@x.com', 'ADMIN', 't', 'b', '']],
  });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /ADMIN cuối cùng/);
});

test('perm-rpc: setUserPerms ghi dung o cot 5', () => {
  const { res, writes } = runSetUserPerms({
    me: 'admin@x.com', email: 's@x.com', role: 'STAFF', keys: ['create', 'liq'],
    rows: [['admin@x.com', 'ADMIN', 't', 'b', ''], ['s@x.com', 'STAFF', 't', 'b', '']],
  });
  assert.strictEqual(res.ok, true);
  const w5 = writes.find((w) => w.c === 5);
  assert.ok(w5, 'phai ghi cot 5');
  assert.strictEqual(JSON.stringify(w5.vals), JSON.stringify([['create,liq']]));
});
