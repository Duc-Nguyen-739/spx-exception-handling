const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Mirror: Code.gs addFeedback text validation (trim + non-empty + max 2000)
function feedbackValidateText(text) {
  var t = String(text || '').trim();
  if (!t) return [false, 'Vui lòng nhập nội dung.'];
  if (t.length > 2000) return [false, 'Tối đa 2000 ký tự.'];
  return [true, t];
}

// Mirror: server gating -> ADMIN only may reply; any logged-in user may post.
function canReply(role) { return role === 'ADMIN'; }
function canPost(role) { return !!role; }

test('feedback: validate text — trống + quá dài', () => {
  assert.deepStrictEqual(feedbackValidateText('   '), [false, 'Vui lòng nhập nội dung.']);
  assert.deepStrictEqual(feedbackValidateText(null), [false, 'Vui lòng nhập nội dung.']);
  assert.deepStrictEqual(feedbackValidateText(''), [false, 'Vui lòng nhập nội dung.']);
  assert.strictEqual(feedbackValidateText('x'.repeat(2001))[0], false);
  assert.strictEqual(feedbackValidateText('x'.repeat(2000))[0], true);
});

test('feedback: role gating — chỉ ADMIN mới Reply', () => {
  assert.strictEqual(canReply('ADMIN'), true);
  assert.strictEqual(canReply('STAFF'), false);
  assert.strictEqual(canReply(null), false);
  assert.strictEqual(canPost('ADMIN'), true);
  assert.strictEqual(canPost('STAFF'), true);
});

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, '..', 'mock/mock-google.js'), 'utf8');

test('feedback: index.html — icon ngay sau bell + modal + wiring', () => {
  assert.ok(html.includes('id="btnFeedback"'), 'missing #btnFeedback icon');
  assert.ok(html.includes('id="fbModal"'), 'missing #fbModal');
  assert.ok(html.includes('id="fbList"'), 'missing #fbList');
  assert.ok(html.includes('id="fbInput"'), 'missing #fbInput');
  assert.ok(html.includes('id="btnFbSend"'), 'missing #btnFbSend');
  assert.ok(html.includes('gs(\'listFeedback\''), 'missing listFeedback call');
  assert.ok(html.includes('gs(\'addFeedback\''), 'missing addFeedback call');
  assert.ok(html.includes('gs(\'replyFeedback\''), 'missing replyFeedback call');
  assert.ok(html.indexOf('id="btnIntro"') < html.indexOf('id="btnFeedback"'), 'feedback must come after bell');
  assert.ok(html.indexOf('id="btnFeedback"') < html.indexOf('id="whoChip"'), 'feedback must come before whoChip');
  assert.ok(/fbIsAdmin\(\)/.test(html), 'missing admin role check for Reply gate');
  assert.ok(/data-fbid/.test(html), 'missing data-fbid reply gate');
  assert.ok(!html.includes('Feedback chung'), 'tieu de phai Feedback don gian');
});

test('feedback: modal title chi la “Feedback”', () => {
  assert.ok(html.includes('<h2>Feedback</h2>'), 'title must be exactly Feedback');
});

test('feedback: Code.gs — 3 endpoint + requireAdmin_ trong reply', () => {
  assert.ok(/function listFeedback/.test(gs), 'missing listFeedback');
  assert.ok(/function addFeedback/.test(gs), 'missing addFeedback');
  assert.ok(/function replyFeedback/.test(gs), 'missing replyFeedback');
  var rep = gs.split('function replyFeedback')[1].split('function')[0];
  assert.ok(rep.indexOf('requireAdmin_') >= 0, 'replyFeedback must gate ADMIN');
  assert.ok(/Function addFeedback/.test(gs) || /function addFeedback/.test(gs), 'missing addFeedback');
});

test('feedback: mock — seed + 3 endpoint', () => {
  assert.ok(/listFeedback: function/.test(mock), 'mock missing listFeedback');
  assert.ok(/addFeedback: function/.test(mock), 'mock missing addFeedback');
  assert.ok(/replyFeedback: function/.test(mock), 'mock missing replyFeedback');
});
