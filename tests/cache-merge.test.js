const { test } = require('node:test');
const assert = require('node:assert');

// Mirror client cache helpers in index.html (upsert/merge, cache-first).
// Server pushes list once, client keeps it; writes send delta only.
function daysOf() { return 0; }
function makeState() { return { items: [], itemMap: {} }; }
function upsertItem(state, it) {
  if (!it || !it.code) return;
  const cur = state.itemMap[it.code];
  if (cur) { for (const k in it) cur[k] = it[k]; }
  else { state.itemMap[it.code] = it; state.items.push(it); }
}
function mergeItems(state, list) { (list || []).forEach((it) => upsertItem(state, it)); }
function findCached(state, code) { return state.itemMap[code] || null; }

test('cache: merge keeps old items not in new batch', () => {
  const s = makeState();
  mergeItems(s, [{ code: 'A', status: 'chua_xu_ly' }]);
  mergeItems(s, [{ code: 'B', status: 'chua_xu_ly' }]);
  assert.strictEqual(s.items.length, 2);
  assert.ok(findCached(s, 'A'));
  assert.ok(findCached(s, 'B'));
});

test('cache: upsert updates same object (list + map in sync)', () => {
  const s = makeState();
  mergeItems(s, [{ code: 'A', status: 'chua_xu_ly' }]);
  const ref = findCached(s, 'A');
  mergeItems(s, [{ code: 'A', status: 'da_tim_bill' }]);
  assert.strictEqual(s.items.length, 1);
  assert.strictEqual(ref.status, 'da_tim_bill');
  assert.strictEqual(findCached(s, 'A'), ref);
});

test('cache: liqAdd prefers cache, no server call needed', () => {
  const s = makeState();
  mergeItems(s, [{ code: 'Box.1', status: 'chua_xu_ly' }]);
  let serverCalls = 0;
  function liqFind(code) {
    const hit = findCached(s, code);
    if (hit) return hit;
    serverCalls++;
    return null;
  }
  const found = liqFind('Box.1');
  assert.ok(found);
  assert.strictEqual(serverCalls, 0);
  assert.strictEqual(liqFind('Missing'), null);
  assert.strictEqual(serverCalls, 1);
});

test('cache: create response item can unshift without full reload', () => {
  const s = makeState();
  mergeItems(s, [{ code: 'A', status: 'chua_xu_ly' }]);
  const created = { code: 'B', status: 'chua_xu_ly' };
  upsertItem(s, created);
  assert.strictEqual(s.items.length, 2);
  assert.ok(findCached(s, 'B'));
});
