const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Khóa plan remote-queue zero-UI: server 4 API + client poll ngầm, không đổi DOM/CSS.
const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, '..', 'mock', 'mock-google.js'), 'utf8');

test('print-queue: header du 9 cot', () => {
  assert.ok(gs.includes("var PRINTQUEUE_HEADER = ['job_id', 'codes_json', 'requested_at', 'requested_by', 'status', 'claimed_by', 'claimed_at', 'done_at', 'note'];"));
});

test('print-queue: du 4 API server', () => {
  for (const fn of ['function enqueuePrintJob(', 'function pollPrintJobs(', 'function claimPrintJob(', 'function ackPrintJob(']) {
    assert.ok(gs.includes(fn), 'thieu ' + fn);
  }
});

test('print-queue: enqueue validate 1..10 + dinh dang', () => {
  assert.ok(gs.includes('list.length > 10'), 'thieu chan 10');
  assert.ok(gs.includes('validPrintCode_'), 'thieu validate dinh dang');
  assert.ok(gs.includes('function validPrintCode_('), 'thieu ham valid');
});

test('print-queue: lock + batch, khong loop getValue le', () => {
  const seg = gs.slice(gs.indexOf('function enqueuePrintJob('), gs.indexOf('function prefix_(kind)'));
  assert.ok(seg.includes('withLock_'), 'enqueue/claim/ack phai withLock_');
  assert.ok(seg.includes('.getValues()'), 'poll/claim phai batch getValues');
  assert.ok(seg.includes('.setValues('), 'claim/ack phai batch setValues');
  assert.ok(!/\.getValue\(/.test(seg), 'cam getValue le trong queue');
  assert.ok(!/\.setValue\(/.test(seg), 'cam setValue le trong queue');
});

test('print-queue: claim chi pending->printing, chong 2 tram', () => {
  assert.ok(gs.includes("Đã có trạm nhận."), 'thieu guard 2 tram');
  assert.ok(gs.includes("'printing'"), 'thieu status printing');
});

test('print-queue-noui: client phan vai ngam + poll 3s + nghi 10s', () => {
  assert.ok(html.includes('function isStation_()'), 'thieu isStation_');
  assert.ok(html.includes('function stationPollOnce_'), 'thieu poller');
  assert.ok(html.includes('function startStationPoller_'), 'thieu starter');
  assert.ok(html.includes('var STATION_POLL_MS=3000'), 'poll phai 3s');
  assert.ok(html.includes('var STATION_COOLDOWN_MS=10000'), 'nghi phai 10s');
  assert.ok(html.includes('stationPrinting_'), 'thieu co isPrinting serial');
  assert.ok(html.includes('stationNextAllowed_'), 'thieu cooldown sau in xong');
  assert.ok(html.includes("afterprint"), 'phai ack qua onafterprint');
  assert.ok(html.includes('function viewPrintVisible_()'), 'chi poll khi tab In Ma dang mo');
  assert.ok(html.includes('function stationId_()'), 'stationId ngam localStorage');
  assert.ok(html.includes('doPrintMany(codes)'), 'tram tai dung renderer cu');
});

test('print-queue-noui: phone enqueue, laptop direct, khong doi DOM/CSS', () => {
  assert.ok(html.includes('enqueueRemotePrint_'), 'thieu enqueue');
  assert.ok(html.includes("gs('enqueuePrintJob'"), 'phone phai goi enqueue');
  assert.ok(html.includes("gs('pollPrintJobs'"), 'tram phai poll');
  assert.ok(html.includes("gs('claimPrintJob'"), 'tram phai claim');
  assert.ok(html.includes("gs('ackPrintJob'"), 'tram phai ack');
  for (const bad of ['viewStation', 'stationBtn', 'queueList', 'btnStation']) {
    assert.ok(!html.includes(bad), 'cam them UI moi: ' + bad);
  }
  assert.ok(!html.includes('.printOnly{display:none'), 'nut In Ma detail/edit phai hien tren mobile');
  assert.ok(!html.includes('#btnPrintMain,#btnPrintTop{display:none'), 'nut In Ma rangebar phai hien tren mobile');
  assert.ok(html.includes('btnPrintMain') && html.includes('btnPrintTop') && html.includes('scanPrint'), 'nut In Ma cu phai con nguyen');
});

test('print-queue: mock du 4 API cho file://', () => {
  for (const fn of ['enqueuePrintJob', 'pollPrintJobs', 'claimPrintJob', 'ackPrintJob']) {
    assert.ok(mock.includes(fn), 'mock thieu ' + fn);
  }
});
