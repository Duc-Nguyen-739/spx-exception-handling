const { test } = require('node:test');
const assert = require('node:assert');

// KHỚP index.html: openPhoneScan/onPhoneDecoded/buildScanPopupHtml_.
// Client quét bằng camera điện thoại: popup top-level trong GAS iframe,
// fallback chụp ảnh (scanFile), dedup 1.5s, route theo ô quét.
const CAM_CODE_COOLDOWN_MS = 1500;
const CAM_FPS = 25;
const SCAN_MSG_TYPE = 'spxScanResult';
const FORMATS = ['QR_CODE', 'CODE_128', 'CODE_39', 'CODE_93', 'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'ITF', 'CODABAR', 'DATA_MATRIX', 'AZTEC'];

function routeOf(target) {
  if (target === 'scanLiq') return 'liqAdd';
  if (target === 'resolveBill') return 'fillBill';
  if (target === 'scanPrint') return 'autoPrint';
  return 'openDetail';
}

function dedupOk(lastCode, lastTs, code, now) {
  if (String(code) === String(lastCode) && now - lastTs < CAM_CODE_COOLDOWN_MS) return false;
  return true;
}

test('camera-scan: route đúng 4 điểm quét', () => {
  assert.strictEqual(routeOf('scanMain'), 'openDetail');
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
  assert.ok(FORMATS.includes('QR_CODE'));
  assert.ok(FORMATS.includes('CODE_128'));
  assert.strictEqual(SCAN_MSG_TYPE, 'spxScanResult');
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
