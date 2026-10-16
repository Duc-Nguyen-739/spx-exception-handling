'use strict';
// Parity hành vi Code.gs ↔ api/logic.py (differential test): chạy hàm pure của
// Code.gs trong vm + so output với bản Python trên cùng input. check-drift chỉ so
// cấu trúc; file này bắt lệch semantics.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { extractFn, extractVar, makeSandbox } = require('./gs-vm.js');
const { CORE_PAIRS } = require('../scripts/check-drift.js');

const ROOT = path.join(__dirname, '..');
const gs = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');

const GAS_FNS = ['strip_', 'canonicalStatus_', 'codeDate_', 'validYMD_', 'parseCreatedSmart_',
  'normSite_', 'siteSuffix_', 'sheetName_', 'driveIdFromUrl_', 'fileIdOf_', 'normHead_',
  'billOf_', 'prefix_', 'seqNum_', 'nextSeqBothCodes_', 'storageDays_'];

// now cố định 2 phía: JS Date.now = epoch "13/10/2026 12:00" giờ máy chạy,
// Python now = 13/10/2026 12:00 +07. Created/now cách 7 ngày 11h30 wall-clock nên
// floor = 7 bất kể host TZ (chênh TZ/DST ≤1h không đổi kết quả).
const NOW_EPOCH = new Date(2026, 9, 13, 12, 0, 0).getTime();
const NOW_PY = '@dt:2026-10-13T12:00:00+07:00';

const sb = makeSandbox([
  extractVar(gs, 'SITE_SUFFIX_'),
  extractVar(gs, 'STATUS_RULES'),
  ...GAS_FNS.map((n) => extractFn(gs, n)),
  'Date.now = function () { return ' + NOW_EPOCH + '; };',
]);

// [gasFn, pyFn, jsArgs, pyArgs?] — pyArgs mặc định jsArgs; '@dt:<iso>' → datetime Python.
const CASES = [
  // canonicalStatus_ ↔ canonical_status
  ['canonicalStatus_', 'canonical_status', ['Đã tìm thấy bill']],
  ['canonicalStatus_', 'canonical_status', ['Thanh lý']],
  ['canonicalStatus_', 'canonical_status', ['đi theo SPXVN123456']],
  ['canonicalStatus_', 'canonical_status', ['Tiêu hủy']],
  ['canonicalStatus_', 'canonical_status', ['abc xyz']],
  ['canonicalStatus_', 'canonical_status', ['']],
  // codeDate_ ↔ code_date
  ['codeDate_', 'code_date', ['Box.06-10-2026.1']],
  ['codeDate_', 'code_date', ['BOX.06102026.5']],
  ['codeDate_', 'code_date', ['Item.06-10-2026.12']],
  ['codeDate_', 'code_date', ['LT.123']],
  ['codeDate_', 'code_date', ['']],
  // parseCreatedSmart_ ↔ parse_created_smart
  ['parseCreatedSmart_', 'parse_created_smart', ['06/10/2026 08:02:00', 'Box.06-10-2026.1']],
  ['parseCreatedSmart_', 'parse_created_smart', ['10/06/2026 08:02', 'Box.06-10-2026.1']],
  ['parseCreatedSmart_', 'parse_created_smart', ['06/10/2026', 'Box.06-10-2026.1']],
  ['parseCreatedSmart_', 'parse_created_smart', ['31/02/2026 10:00', '']],
  ['parseCreatedSmart_', 'parse_created_smart', ['rác', 'Box.06-10-2026.1']],
  // fileIdOf_ ↔ extract_drive_id (CORE pair; driveIdFromUrl_ chỉ là helper con)
  ['fileIdOf_', 'extract_drive_id', ['1AbCdEfGhIjK']],
  ['fileIdOf_', 'extract_drive_id', ['  1AbCdEfGhIjK  ']],
  ['fileIdOf_', 'extract_drive_id', ['https://drive.google.com/file/d/1AbCdEfGhIjK/view?usp=sharing']],
  ['fileIdOf_', 'extract_drive_id', ['https://drive.google.com/open?id=1AbCdEfGhIjK']],
  ['fileIdOf_', 'extract_drive_id', ['abc']],
  ['fileIdOf_', 'extract_drive_id', ['']],
  // storageDays_ ↔ storage_days (now cố định 2 phía)
  ['storageDays_', 'storage_days', ['06/10/2026 00:30:00', 'Box.06-10-2026.1'],
    ['06/10/2026 00:30:00', NOW_PY, 'Box.06-10-2026.1']],
  ['storageDays_', 'storage_days', ['13/10/2026 00:30:00', 'Box.13-10-2026.1'],
    ['13/10/2026 00:30:00', NOW_PY, 'Box.13-10-2026.1']],
  ['storageDays_', 'storage_days', ['rác', 'Box.06-10-2026.1'],
    ['rác', NOW_PY, 'Box.06-10-2026.1']],
  // normSite_ ↔ norm_site
  ['normSite_', 'norm_site', ['hn soc']],
  ['normSite_', 'norm_site', ['HNSOC']],
  ['normSite_', 'norm_site', ['HN2']],
  ['normSite_', 'norm_site', ['lạ']],
  // sheetName_ ↔ sheet_name
  ['sheetName_', 'sheet_name', ['Items', 'HN']],
  ['sheetName_', 'sheet_name', ['Items', 'HN2']],
  ['sheetName_', 'sheet_name', ['Users', '']],
  // normHead_ ↔ _norm_head
  ['normHead_', '_norm_head', ['Ảnh ngoại quan']],
  ['normHead_', '_norm_head', ['Đã Resolve']],
  ['normHead_', '_norm_head', ['']],
  // billOf_ ↔ history_bill
  ['billOf_', 'history_bill', ['a', 'da_tim_bill', 'SPXVN1']],
  ['billOf_', 'history_bill', ['a', 'thanh_ly', 'SPXVN1']],
  ['billOf_', 'history_bill', ['a', 'chua_xu_ly', 'SPXVN1']],
  ['billOf_', 'history_bill', ['a', 'da_tim_bill', '']],
  // nextSeqBothCodes_ ↔ next_seq_reserved (dt = 06/10/2026)
  ['nextSeqBothCodes_', 'next_seq_reserved',
    [['Box.06-10-2026.1', 'Box.06-10-2026.7'], ['Box.06-10-2026.3'], 'Box', '06-10-2026'],
    [['Box.06-10-2026.1', 'Box.06-10-2026.7'], ['Box.06-10-2026.3'], 'Box', '@dt:2026-10-06T00:00:00+07:00']],
  ['nextSeqBothCodes_', 'next_seq_reserved', [[], [], 'Item', '06-10-2026'],
    [[], [], 'Item', '@dt:2026-10-06T00:00:00+07:00']],
];

const PY_SCRIPT = [
  'import json, sys',
  'from datetime import datetime',
  "sys.path.insert(0, '.')",
  'import api.logic as L',
  'def conv(a):',
  "    if isinstance(a, str) and a.startswith('@dt:'):",
  '        return datetime.fromisoformat(a[4:])',
  '    return a',
  'def norm(v):',
  '    if v is None:',
  '        return None',
  '    if isinstance(v, tuple):',
  '        return list(v)',
  '    if isinstance(v, datetime):',
  "        return {'y': v.year, 'm': v.month, 'd': v.day, 'hh': v.hour, 'mi': v.minute, 'ss': v.second}",
  '    return v',
  'cases = json.load(sys.stdin)',
  'out = []',
  'for c in cases:',
  "    fn = getattr(L, c['pyFn'])",
  "    args = [conv(a) for a in c['pyArgs']]",
  '    try:',
  '        out.append(norm(fn(*args)))',
  '    except Exception as e:',
  "        out.append({'__error__': type(e).__name__ + ': ' + str(e)})",
  'json.dump(out, sys.stdout, ensure_ascii=False)',
].join('\n');

const hasPy = !spawnSync('python3', ['--version'], { encoding: 'utf8' }).error;

// {y,m,d,...} (2 phía) → mảng cùng thứ tự để deep-compare.
function flatten(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const keys = ['y', 'm', 'd', 'hh', 'mi', 'ss'].filter((k) => k in v);
    if (keys.length) return keys.map((k) => v[k]);
  }
  return v;
}

test('parity: phủ đủ 10 cặp CORE của check-drift', () => {
  const missing = CORE_PAIRS
    .filter((p) => !CASES.some((c) => c[0] === p.gas && c[1] === p.py))
    .map((p) => p.gas + ' ↔ ' + p.py);
  assert.deepStrictEqual(missing, [], 'thiếu case parity: ' + missing.join(', '));
});

test('parity: Code.gs (vm) == api/logic.py (python3) trên mọi case', { skip: !hasPy }, () => {
  const payload = JSON.stringify(CASES.map((c) => ({ pyFn: c[1], pyArgs: c[3] || c[2] })));
  const res = spawnSync('python3', ['-c', PY_SCRIPT], {
    input: payload,
    cwd: ROOT,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }),
  });
  assert.strictEqual(res.status, 0, 'python3 lỗi: ' + (res.stderr || res.error));
  const pyOut = JSON.parse(res.stdout);
  assert.strictEqual(pyOut.length, CASES.length);
  const diffs = [];
  CASES.forEach((c, i) => {
    const jsOut = JSON.parse(sb.run(c[0], c[2]));
    const py = pyOut[i];
    if (py && py.__error__) {
      diffs.push(c[0] + ' ' + JSON.stringify(c[2]) + ': python lỗi ' + py.__error__);
      return;
    }
    const a = JSON.stringify(flatten(jsOut));
    const b = JSON.stringify(flatten(py));
    if (a !== b) diffs.push(c[0] + ' ' + JSON.stringify(c[2]) + ': JS ' + a + ' != PY ' + b);
  });
  assert.deepStrictEqual(diffs, [], 'lệch hành vi Code.gs ↔ logic.py:\n' + diffs.join('\n'));
});
