const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

// Hoi quy P0 (15/10/2026): truyen site (chuoi) vao o maxRows (so) lam
// Math.max(1,'HN2') = NaN -> getRange(NaN) -> "starting row of the range
// is too small", list trang chu trang tinh. Test chay CODE THAT cua
// photosForCodes_/logsForCodes_ voi sheet gia, bat moi getRange phai la
// so nguyen (row>=1, nrows>=1).
const GS = fs.readFileSync('Code.gs', 'utf8');

function extractFn(name) {
  const start = GS.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  let depth = 0;
  const i = GS.indexOf('{', start);
  for (let j = i; j < GS.length; j++) {
    if (GS[j] === '{') depth++;
    if (GS[j] === '}') { depth--; if (!depth) return GS.slice(start, j + 1); }
  }
  throw new Error('unbalanced ' + name);
}

const FNS = ['normSite_', 'strip_', 'normHead_', 'codeDate_', 'validYMD_',
  'parseCreatedSmart_', 'normAt_', 'cellText_', 'billOf_', 'logCols_', 'logEntry_',
  'readPhotosTail_', 'readLogTail_', 'photosForCodes_', 'logsForCodes_'];
const LIB = FNS.map(extractFn).join('\n');

function runChain(lastRow, site) {
  const ranges = [];
  const fakeSh = {
    getLastRow: () => lastRow,
    getLastColumn: () => 7,
    getRange: (r, c, nr, nc) => {
      ranges.push([r, c, nr, nc]);
      if (nr === 1) return { getValues: () => [['at', 'code', 'from_status', 'to_status', 'by', 'note', 'reason']] };
      return { getValues: () => [] };
    },
  };
  const sb = {
    TAIL_ROWS: 3000,
    PHOTOS_HEADER: ['code', 'slot', 'drive_file_id', 'uploaded_at'],
    LOG_HEADER: ['at', 'code', 'from_status', 'to_status', 'by', 'note', 'reason'],
    getSheetFor_: () => fakeSh,
    Utilities: { formatDate: () => '01/01/2026 00:00:00' },
  };
  vm.createContext(sb);
  vm.runInContext(LIB, sb);
  const outPhoto = vm.runInContext("photosForCodes_({A:1}, '" + site + "')", sb);
  const outLog = vm.runInContext("logsForCodes_({A:1}, '" + site + "')", sb);
  return { ranges, outPhoto, outLog };
}

for (const site of ['HN2', 'HN']) {
  test('station-site-tail: range luon so nguyen, khong NaN (site ' + site + ')', () => {
    const { ranges } = runChain(50, site);
    assert.ok(ranges.length > 0, 'phai doc tail');
    for (const [r, c, nr, nc] of ranges) {
      assert.ok(Number.isInteger(r) && r >= 1, 'row phai int>=1, got ' + r);
      assert.ok(Number.isInteger(nr) && nr >= 1, 'nrows phai int>=1, got ' + nr);
      assert.ok(Number.isInteger(c) && c >= 1, 'col phai int>=1');
      assert.ok(Number.isInteger(nc) && nc >= 1, 'ncols phai int>=1');
    }
  });
}

test('station-site-tail: sheet moi (1 dong) khong doc range nao', () => {
  const { ranges, outPhoto, outLog } = runChain(1, 'HN2');
  assert.deepStrictEqual(ranges, [], 'sheet header-only thi return som');
  assert.strictEqual(outPhoto, null);
  assert.strictEqual(outLog, null);
});
