const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Mockup 13: vao tab Thanh Ly tu focus o scan tren PC, mobile giu nguyen.
const html = fs.readFileSync('index.html', 'utf8');

test('liq-autofocus: showLiq focus scan tren PC (isStation), buoc 2 focus ma thanh ly', () => {
  const i = html.indexOf('function showLiq(on)');
  assert.ok(i >= 0, 'thieu showLiq');
  const body = html.slice(i, i + 700);
  assert.ok(body.includes('isStation_()'), 'chi focus tren PC (isStation_)');
  assert.ok(body.includes("getElementById('scanLiq').focus()"), 'focus o scan buoc 1');
  assert.ok(body.includes("getElementById('liqCode').focus()"), 'focus o ma thanh ly buoc 2');
  assert.ok(body.includes('liqStep2()'), 'chon o theo buoc hien tai');
});

test('liq-autofocus: khong doi behavior In Ma va liqToStep2', () => {
  assert.ok(html.includes("if(sp&&document.getElementById('singleZone').style.display!=='none')sp.focus()"), 'In Ma giu focus cu');
  assert.ok(html.includes("var inp=document.getElementById('liqCode');if(inp)inp.focus();"), 'liqToStep2 giu focus cu');
});
