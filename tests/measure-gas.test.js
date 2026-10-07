const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const m = require('../scripts/measure-gas.js');

// Contract offline cho scripts/measure-gas.js (khong network, khong secret).
test('measure-gas: parseDuration "3.5s" -> ms', () => {
  assert.strictEqual(m.parseDuration('3.5s'), 3500);
  assert.strictEqual(m.parseDuration('0.042s'), 42);
  assert.strictEqual(m.parseDuration('10s'), 10000);
  assert.strictEqual(m.parseDuration(''), null);
  assert.strictEqual(m.parseDuration('RUNNING'), null);
  assert.strictEqual(m.parseDuration(null), null);
});

test('measure-gas: buildUrl encode + chan pageSize 1..100', () => {
  const u = m.buildUrl('abc/def+ghi', 200, '');
  assert.ok(u.startsWith('https://script.googleapis.com/v1/processes:listScriptProcesses?'));
  assert.ok(u.includes('scriptId=abc%2Fdef%2Bghi'));
  assert.ok(u.includes('pageSize=100'));
  assert.ok(!u.includes('pageToken'));
  assert.ok(m.buildUrl('x', 5, 'tok/1').includes('pageToken=tok%2F1'));
});

test('measure-gas: parseArgs mac dinh + co so', () => {
  assert.deepStrictEqual(m.parseArgs([]), { limit: 20, fn: '', status: '' });
  const o = m.parseArgs(['--limit', '5', '--fn', 'listFull', '--status', 'completed']);
  assert.deepStrictEqual(o, { limit: 5, fn: 'listFull', status: 'COMPLETED' });
});

test('measure-gas: summarize avg/max theo function, bo qua duration thieu', () => {
  const out = m.summarize([
    { functionName: 'listFull', ms: 1000 },
    { functionName: 'listFull', ms: 3000 },
    { functionName: 'listFull', ms: null },
    { functionName: 'createBox', ms: 500 },
  ]);
  assert.deepStrictEqual(out, [
    { fn: 'createBox', n: 1, avg: 500, max: 500 },
    { fn: 'listFull', n: 3, avg: 2000, max: 3000 },
  ]);
});

test('measure-gas: main bao thieu env, khong goi network', async () => {
  let calls = 0;
  const code1 = await m.main([], {}, async () => { calls++; return {}; });
  assert.strictEqual(code1, 1);
  const code2 = await m.main([], { GAS_SCRIPT_ID: 'x' }, async () => { calls++; return {}; });
  assert.strictEqual(code2, 1);
  assert.strictEqual(calls, 0);
});

test('measure-gas: main loc theo fn + in bang (fetch stub)', async () => {
  const lines = [];
  const origLog = console.log;
  console.log = (s) => lines.push(String(s));
  try {
    const fake = async () => ({
      ok: true,
      json: async () => ({
        processes: [
          { functionName: 'listFull', startTime: 't1', processStatus: 'COMPLETED', duration: '1.5s' },
          { functionName: 'createBox', startTime: 't2', processStatus: 'COMPLETED', duration: '2s' },
        ],
      }),
    });
    const code = await m.main(['--fn', 'listFull'], { GAS_SCRIPT_ID: 'x', GAS_MEASURE_TOKEN: 'y' }, fake);
    assert.strictEqual(code, 0);
    assert.ok(lines.some((l) => l.includes('listFull') && l.includes('1500 ms')));
    assert.ok(!lines.some((l) => l.includes('createBox') && l.includes('2000 ms')));
  } finally {
    console.log = origLog;
  }
});

test('measure-gas: script khong bao gio in token/scriptId', () => {
  const src = fs.readFileSync('scripts/measure-gas.js', 'utf8');
  const leaks = [];
  for (const line of src.split('\n')) {
    if (/console\.(log|error)/.test(line) && /(\+\s*(token|scriptId)|\$\{(token|scriptId)\})/.test(line)) {
      leaks.push(line.trim());
    }
  }
  assert.deepStrictEqual(leaks, [], 'log khong duoc in secret: ' + leaks.join(' '));
});
