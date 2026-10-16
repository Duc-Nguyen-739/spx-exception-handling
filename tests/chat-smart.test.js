const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Mirror: Code.gs chatSmart input validation (name OR photo + inboundTime).
function chatValidate(p) {
  p = p || {};
  var name = String(p.productName || '').trim();
  var photo = String(p.photo || '');
  var at = String(p.inboundTime || '').trim();
  if (!name && !photo) return [false, 'Chụp ảnh hoặc nhập tên sản phẩm.'];
  if (!at) return [false, 'Nhập thời gian nhập kho.'];
  return [true, ''];
}

// Mirror: Code.gs chatSmart Smart-response parse (result là chuỗi JSON 2 lớp).
function chatParseResult(body) {
  var raw = body.result == null ? '' : body.result;
  var inner = (typeof raw === 'string' && raw) ? JSON.parse(raw) : raw;
  var list = (inner && inner.results) || [];
  return list.slice(0, 5).map(function (r) {
    return {
      shipment_id: String(r.shipment_id || ''), product_name: String(r.product_name || ''),
      aging_leadtime: String(r.aging_leadtime || ''), last_touch_at: String(r.last_touch_at || ''),
      score: +r.score || 0, reason: String(r.reason || '')
    };
  }).filter(function (r) { return !!r.shipment_id; });
}

test('chat-smart: validate — thiếu cả tên + ảnh, thiếu giờ', () => {
  assert.deepStrictEqual(chatValidate({}), [false, 'Chụp ảnh hoặc nhập tên sản phẩm.']);
  assert.deepStrictEqual(chatValidate({ productName: '  ' }), [false, 'Chụp ảnh hoặc nhập tên sản phẩm.']);
  assert.deepStrictEqual(chatValidate({ productName: 'chuot' }), [false, 'Nhập thời gian nhập kho.']);
  assert.deepStrictEqual(chatValidate({ photo: 'data:image/jpeg;base64,x' }), [false, 'Nhập thời gian nhập kho.']);
  assert.deepStrictEqual(chatValidate({ productName: 'chuot', inboundTime: '16/10/2026 14:00' }), [true, '']);
});

test('chat-smart: parse — chuỗi JSON 2 lớp + lọc rỗng + chặn 5', () => {
  var body = { result: JSON.stringify({ results: [
    { shipment_id: 'SPXVN1', product_name: 'A', aging_leadtime: '06', last_touch_at: 't', score: 74, reason: 'r' },
    { shipment_id: '', product_name: 'B', score: 10 },
    { shipment_id: 'SPXVN2', score: '55' }
  ] }) };
  var out = chatParseResult(body);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].shipment_id, 'SPXVN1');
  assert.strictEqual(out[0].score, 74);
  assert.strictEqual(out[1].score, 55);
  assert.deepStrictEqual(chatParseResult({}), []);
  assert.deepStrictEqual(chatParseResult({ result: '{"results":[]}' }), []);
});

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, '..', 'mock/mock-google.js'), 'utf8');

test('chat-smart: guard UI + server + mock', () => {
  assert.ok(html.includes('id="aiBub"'), 'missing #aiBub');
  assert.ok(!html.includes('id="fabChat"'), 'old #fabChat must be gone');
  assert.ok(html.includes('@media(max-width:899px){#aiBub{display:none'), 'aiBub must hide on mobile');
  assert.ok(html.includes('spx_aiBub'), 'missing drag persist key');
  assert.ok(html.includes('btnPrintMain'), 'aiBub must dock next to In Ma');
  assert.ok(html.includes('can(\'backlog\')'), 'aiBub must gate backlog perm');
  assert.ok(html.includes('id="chatModal"'), 'missing #chatModal');
  assert.ok(html.includes('id="chatThread"'), 'missing #chatThread');
  assert.ok(html.includes('id="chatName"'), 'missing #chatName');
  assert.ok(html.includes('id="chatTime"'), 'missing #chatTime');
  assert.ok(html.includes('id="chatPhoto"'), 'missing #chatPhoto');
  assert.ok(html.includes('id="btnChatSend"'), 'missing #btnChatSend');
  assert.ok(html.includes("gs('chatSmart'"), 'missing chatSmart call');
  assert.ok(gs.includes('function chatSmart(p, site)'), 'missing server chatSmart');
  assert.ok(gs.includes("checkPerm_('backlog', site)"), 'chatSmart must gate backlog perm');
  assert.ok(gs.includes('SMART_ENDPOINT_HASH') && gs.includes('SMART_ENDPOINT_KEY'), 'missing Smart props');
  assert.ok(!/getProperty\(PROP_SMART_KEY\)[^]*Logger\.log\([^)]*key/i.test(gs), 'must not log key');
  assert.ok(mock.includes('chatSmart: function'), 'missing mock chatSmart');
});
