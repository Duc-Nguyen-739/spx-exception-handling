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

// Mirror: Code.gs chatSmart Smart-response parse — dò qua result/data/output,
// chuỗi JSON lồng nhau, mảng trần (pickList) rồi mới kết luận rỗng.
function pickList(o) {
  if (!o) return null;
  if (Object.prototype.toString.call(o) === '[object Array]') return o;
  if (typeof o === 'string') { try { return pickList(JSON.parse(o)); } catch (_) { return null; } }
  if (o.results) return o.results;
  return pickList(o.result) || pickList(o.data) || pickList(o.output) || null;
}
function chatParseResult(body) {
  var list = pickList(body) || [];
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
  // envelope da dang: data.results, output JSON string, mang tran
  assert.strictEqual(chatParseResult({ data: { results: [{ shipment_id: 'S9' }] } }).length, 1);
  assert.strictEqual(chatParseResult({ output: '{"results":[{"shipment_id":"S8"}]}' }).length, 1);
  assert.strictEqual(chatParseResult([{ shipment_id: 'S7' }]).length, 1);
});

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, '..', 'mock/mock-google.js'), 'utf8');

test('chat-smart: guard UI + server + mock', () => {
  assert.ok(html.includes('id="aiBub"'), 'missing #aiBub');
  assert.ok(!html.includes('id="fabChat"'), 'old #fabChat must be gone');
  assert.ok(html.includes('@media(max-width:899px){#aiBub{display:none'), 'aiBub must hide on mobile');
  assert.ok(html.includes('spx_aiBub'), 'missing drag persist key');
  assert.ok(!html.includes('document.body.scrollHeight'), 'aiBub drag must not force layout per move');
  assert.ok(html.includes('requestAnimationFrame'), 'aiBub drag must coalesce via rAF');
  assert.ok(html.includes('window.innerHeight'), 'aiBub clamp must be viewport-space');
  assert.ok(html.includes('.modal.open ~ #aiBub'), 'bubble must hide when any modal is open');
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
  assert.ok(gs.includes('function scrub(s)'), 'chatSmart must keep scrub helper');
  assert.ok(gs.includes('function pickList(o)'), 'chatSmart must keep pickList helper');
  assert.ok(gs.includes('function chatSmart(p, site)'), 'missing server chatSmart');
  assert.ok(gs.includes('function chatSmartStatus(jobId, site)'), 'missing chatSmartStatus');
  assert.ok(gs.includes('SMARTJOBS_HEADER'), 'missing SmartJobs header');
  assert.ok(gs.includes('smartJobsSheet_'), 'missing smartJobsSheet_ helper');
  assert.ok(gs.includes('smartClaimJob'), 'missing smartClaimJob');
  assert.ok(gs.includes('smartCompleteJob'), 'missing smartCompleteJob');
  assert.ok(gs.includes('uploadChatPhoto_'), 'missing uploadChatPhoto_ helper');
  assert.ok(gs.includes("action === 'getPhoto'"), 'missing getPhoto route');
  assert.ok(gs.includes('photoFileId'), 'missing photoFileId column');
  assert.ok(gs.includes('SMART_BRIDGE_TOKEN') || gs.includes('PROP_SMART_BRIDGE'), 'missing bridge token prop');
  assert.ok(gs.includes('bridgeAuth_'), 'missing bridgeAuth_');
  assert.ok(!gs.includes('pollSmartAsync'), 'pollSmartAsync must be removed');
  assert.ok(!gs.includes('deployments/get_debug_tree'), 'must not reference debug tree path');
  assert.ok(/checkPerm_\('backlog', site\);/.test(gs), 'chatSmart must gate backlog perm');
  assert.ok(!/getProperty\(PROP_SMART_KEY\)[^]*Logger\.log\([^)]*key/i.test(gs), 'must not log key');
  assert.ok(mock.includes('chatSmart: function'), 'missing mock chatSmart');
  assert.ok(mock.includes('chatSmartStatus: function'), 'missing mock chatSmartStatus');
});
