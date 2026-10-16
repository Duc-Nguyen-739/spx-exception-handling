const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Guard policy gop Users (Q1/Q3): ADMIN thang + hop quyen, cot kho theo membership.
// Ham mergeUsersRows_ trich tu Code.gs bang vm (pattern KHOP tests/perm-model.test.js).
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

function makeSb() {
  const mK = gs.match(/var PERM_KEYS\s*=\s*(\[[\s\S]*?\]);/);
  const mD = gs.match(/var PERM_DEFAULT\s*=\s*(\{[\s\S]*?\});/);
  assert.ok(mK && mD, 'missing PERM_KEYS/PERM_DEFAULT');
  const sb = { PERM_KEYS: null, PERM_DEFAULT: null, Logger: { log: () => {} } };
  vm.createContext(sb);
  vm.runInContext(mK[0] + '\n' + mD[0], sb);
  sb.normEmail_ = (s) => String(s || '').trim().toLowerCase();
  sb.cellText_ = (v) => (v == null ? '' : String(v));
  sb.textDate_ = (v) => {
    const s = sb.cellText_(v);
    return /^\d{2}\/\d{2}\/\d{4}/.test(s) ? "'" + s : s;
  };
  vm.runInContext(
    fnSrc('parsePerms_') + '\n' + fnSrc('mergeUsersRows_') + '\nthis.__m = mergeUsersRows_;',
    sb,
  );
  return sb;
}

function run(base, extra) {
  const sb = makeSb();
  sb.__base = base;
  sb.__extra = extra;
  return vm.runInContext('__m(__base, __extra)', sb);
}

test('users-merge: chi o HN2 -> giu nguyen, chi vao HN2', () => {
  const r = run([['a@x.com', 'STAFF', '01/01/2026 08:00:00', 'seed', 'create,liq']], []);
  assert.strictEqual(r.rows.length, 1);
  const [email, role, at, by, perms] = r.rows[0];
  assert.strictEqual(email, 'a@x.com');
  assert.strictEqual(role, 'STAFF');
  assert.ok(perms.includes('create') && perms.includes('liq'), perms);
  assert.ok(!perms.split(',').includes('siteHN'), 'khong duoc cap siteHN: ' + perms);
  assert.ok(perms.split(',').includes('siteHN2'), 'phai co siteHN2: ' + perms);
  assert.strictEqual(r.log.length, 0, 'khong trung thi log rong');
});

test('users-merge: chi o HN -> chi vao HN', () => {
  const r = run([], [['b@x.com', 'STAFF', '02/01/2026 08:00:00', 'seed', '']]);
  assert.strictEqual(r.rows.length, 1);
  const perms = r.rows[0][4].split(',');
  assert.ok(perms.includes('siteHN'), 'phai co siteHN: ' + r.rows[0][4]);
  assert.ok(!perms.includes('siteHN2'), 'khong duoc cap siteHN2: ' + r.rows[0][4]);
});

test('users-merge: trung email -> 1 dong, ADMIN thang, quyen hop, vao ca 2 kho', () => {
  const r = run(
    [['c@x.com', 'STAFF', '01/01/2026 08:00:00', 'seed', 'create']],
    [['C@X.com', 'ADMIN', '02/01/2026 09:00:00', 'seed', '']],
  );
  assert.strictEqual(r.rows.length, 1);
  const [email, role, at, by, perms] = r.rows[0];
  assert.strictEqual(email, 'c@x.com');
  assert.strictEqual(role, 'ADMIN');
  assert.strictEqual(perms, '', 'ADMIN viet perms rong');
  assert.ok(r.log.some((l) => l.includes('c@x.com')), 'log phai ghi email trung: ' + r.log);
});

test('users-merge: trung 2 STAFF -> hop key quyen, khong mat them/kia', () => {
  const r = run(
    [['d@x.com', 'STAFF', 't', 'b', 'create']],
    [['d@x.com', 'STAFF', 't', 'b', 'liq,print']],
  );
  assert.strictEqual(r.rows.length, 1);
  const set = new Set(r.rows[0][4].split(','));
  for (const k of ['create', 'liq', 'print', 'siteHN', 'siteHN2']) {
    assert.ok(set.has(k), 'thieu ' + k + ': ' + r.rows[0][4]);
  }
});

test('users-merge: HN2 de trong perms (default) van khong duoc siteHN', () => {
  const r = run([['e@x.com', 'STAFF', 't', 'b', '']], [['f@x.com', 'STAFF', 't', 'b', '']]);
  const byEmail = {};
  r.rows.forEach((row) => { byEmail[row[0]] = row[4].split(','); });
  assert.ok(!byEmail['e@x.com'].includes('siteHN'), 'default HN2 khong lan siteHN');
  assert.ok(byEmail['e@x.com'].includes('siteHN2'));
  assert.ok(byEmail['f@x.com'].includes('siteHN'));
  assert.ok(!byEmail['f@x.com'].includes('siteHN2'));
});

test('users-merge: ngay addedAt giu text + dau nhay (chong Sheets tu parse)', () => {
  const r = run([['g@x.com', 'STAFF', '03/01/2026 08:00:00', 'seed', 'create']], []);
  assert.ok(r.rows[0][2].startsWith("'"), 'thieu dau nhay: ' + r.rows[0][2]);
});

test('users-merge: guard ham merge + helper doc batch ton tai', () => {
  assert.ok(gs.includes('function mergeUsersHNSOCOnce('), 'missing mergeUsersHNSOCOnce');
  assert.ok(gs.includes('function readRowsOf_('), 'missing readRowsOf_');
  assert.ok(gs.includes('function mergeUsersRows_('), 'missing mergeUsersRows_');
});
