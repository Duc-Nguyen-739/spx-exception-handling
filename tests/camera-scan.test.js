const { test } = require('node:test');
const assert = require('node:assert');

// KHỚP index.html: openPhoneScan/onPhoneDecoded/buildScanPopupHtml_.
// Client quét bằng camera điện thoại: popup top-level trong GAS iframe,
// fallback chụp ảnh (scanFile), dedup 1.5s, route theo ô quét.
const CAM_CODE_COOLDOWN_MS = 1500;
const CAM_FPS = 25;
const SCAN_MSG_TYPE = 'spxScanResult';
const FORMATS = ['QR_CODE', 'CODE_128', 'CODE_39', 'EAN_13'];

function routeOf(target) {
  if (target === 'scanLiq') return 'liqAdd';
  if (target === 'resolveBill') return 'fillBill';
  if (target === 'scanPrint') return 'autoPrint';
  return 'fillSearch';
}

function dedupOk(lastCode, lastTs, code, now) {
  if (String(code) === String(lastCode) && now - lastTs < CAM_CODE_COOLDOWN_MS) return false;
  return true;
}

test('camera-scan: route đúng 4 điểm quét', () => {
  assert.strictEqual(routeOf('scanMain'), 'fillSearch');
  assert.strictEqual(routeOf('scanLiq'), 'liqAdd');
  assert.strictEqual(routeOf('resolveBill'), 'fillBill');
  assert.strictEqual(routeOf('scanPrint'), 'autoPrint');
});

test('camera-scan: dedup cùng mã trong 1.5s', () => {
  assert.strictEqual(dedupOk('Box.06-10-2026.1', 1000, 'Box.06-10-2026.1', 2000), false);
  assert.strictEqual(dedupOk('Box.06-10-2026.1', 1000, 'Box.06-10-2026.1', 2600), true);
  assert.strictEqual(dedupOk('Box.06-10-2026.1', 1000, 'Box.06-10-2026.2', 1100), true);
});

test('camera-scan: đủ QR + Code128 cho mã Box/Item và bill SPXVN', () => {
  const html = require('node:fs').readFileSync(__dirname + '/../index.html', 'utf8');
  const m = html.match(/CAM_FMT_NAMES=\[([^\]]+)\]/);
  assert.ok(m, 'thiếu CAM_FMT_NAMES trong index.html');
  assert.deepStrictEqual(m[1].split(',').map((s) => s.replace(/'/g, '')), FORMATS);
  assert.strictEqual(SCAN_MSG_TYPE, 'spxScanResult');
});

test('camera-scan: formatsToSupport phải nằm trong CONSTRUCTOR, không phải start()', () => {
  const html = require('node:fs').readFileSync(__dirname + '/../index.html', 'utf8');
  // html5-qrcode 2.3.8 chỉ đọc formatsToSupport ở new Html5Qrcode(id, cfg);
  // đặt trong start() bị bỏ qua -> decode cả 17 format mỗi khung (chạy chậm, kém nhạy).
  const ctors = [...html.matchAll(/new Html5Qrcode\((['"][^'"]+['"])\s*,\s*([^)]*)\)/g)];
  assert.ok(ctors.length >= 3, 'thiếu new Html5Qrcode(id,cfg) — còn chỗ khởi tạo không truyền config');
  for (const c of ctors) assert.ok(/camCtorCfg_|CTOR_CFG/.test(c[2]), 'constructor thiếu config format: ' + c[0]);
  assert.ok(!/new Html5Qrcode\([^,()]+\)/.test(html.replace(/new Html5Qrcode\([^,]+,[^()]+\(\)\)/g, '')),
    'còn new Html5Qrcode(id) không truyền config');
  assert.ok(!/start\([^;]*formatsToSupport/.test(html), 'formatsToSupport nhét vào start() bị lib bỏ qua');
});

test('camera-scan: ROI gần full-frame + disableFlip (nhạy hơn, rẻ hơn)', () => {
  const html = require('node:fs').readFileSync(__dirname + '/../index.html', 'utf8');
  const fps = html.match(/var CAM_FPS=(\d+)/);
  assert.ok(fps && +fps[1] === CAM_FPS && CAM_FPS >= 20, 'fps phải khớp CAM_FPS và >= 20, đang ' + (fps && fps[1]));
  // ROI rộng x thấp sẽ cắt QR vuông -> chiều cao phải ≥ 80% chiều cao video
  const bh = html.match(/Math\.min\(h\*(0\.\d+),1080\)/);
  assert.ok(bh && parseFloat(bh[1]) >= 0.8, 'chiều cao ROI phải ≥80%, đang ' + (bh && bh[1]));
  assert.ok(/disableFlip:true/.test(html), 'disableFlip phải true — bỏ decode lần 2 ảnh lật ngược');
  assert.ok(!html.includes('qrbox:250'), 'còn qrbox:250 vuông cứng');
  assert.ok(/qrbox:camQrbox_/.test(html), 'qrbox phải là hàm theo viewport');
});

test('camera-scan: popup GAS iframe dùng chung config, không copy riêng', () => {
  const html = require('node:fs').readFileSync(__dirname + '/../index.html', 'utf8');
  assert.ok(!/function pickFm|function pickCfg|function pickBox|function pickCtor/.test(html), 'popup còn copy config riêng (dễ lệch)');
  assert.ok(/camCfgSrc_\(camCtorCfg_\(\)\)/.test(html), 'popup chưa nối config constructor chung');
  assert.ok(/camCfgSrc_\(camScanConfig_\(\)\)/.test(html), 'popup chưa nối config scan chung');
});

test('camera-scan: index.html có engine mới, hết toggleCam/reader cũ', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  for (const s of ['openPhoneScan', 'onPhoneDecoded', 'buildScanPopupHtml_', 'camModal', 'camPrint', SCAN_MSG_TYPE]) {
    assert.ok(html.includes(s), 'thiếu ' + s);
  }
  assert.ok(!html.includes('toggleCam'), 'còn toggleCam cũ');
  assert.ok(!html.includes('id="reader"'), 'còn div reader cũ');
});

test('camera-scan: nhạy hơn — fps cao + khung rộng + native detector + HD', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  for (const s of ['camScanConfig_', 'camQrbox_', 'camBoostFocus_', 'camTorchBtn', 'useBarCodeDetectorIfSupported', 'videoConstraints', 'CAM_FPS']) {
    assert.ok(html.includes(s), 'thiếu ' + s);
  }
  assert.ok(html.includes('fps:25') || html.includes('fps: 25') || html.includes('CAM_FPS'), 'chưa tăng fps');
  assert.ok(!html.includes('fps:10'), 'còn fps:10 cũ chậm');
  assert.ok(!html.includes('qrbox:250'), 'còn qrbox:250 vuông hẹp (barcode 128 dài bị cắt)');
  assert.ok(html.includes('ideal') && html.includes('1920'), 'chưa xin camera HD 1920 cho barcode nhỏ');
  assert.ok(html.includes('CODE_128') && html.includes('QR_CODE'), 'thiếu QR/Code128');
});

test("camera-scan: quet o tim kiem chinh chi dien + loc, khong tu mo chi tiet", () => {
  const html = require("node:fs").readFileSync(__dirname + "/../index.html", "utf8");
  const i = html.indexOf("function onPhoneDecoded(");
  assert.ok(i >= 0, "thieu onPhoneDecoded");
  const tail = html.slice(i, i + 2500);
  const sm = tail.indexOf("getElementById('scanMain')");
  assert.ok(sm >= 0, "thieu nhanh scanMain");
  const branch = tail.slice(sm, sm + 600);
  assert.ok(!branch.includes("openDetail"), "quet xong con tu mo chi tiet");
  assert.ok(branch.includes("dispatchEvent(new Event('input'") || (branch.includes("state.filter") && branch.includes("renderGrid")), "phai kich hoat loc luoi sau khi dien");
});
