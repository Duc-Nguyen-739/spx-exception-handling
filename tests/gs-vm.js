'use strict';
// Helper vm dùng chung cho test đọc Code.gs bằng text (luật 10 — 1 bản duy nhất):
// trích hàm/biến từ source rồi chạy trong vm context, không cần GAS runtime.
const vm = require('node:vm');

// Nguyên thân hàm `function <name>(...) {...}` — brace-scan theo độ sâu.
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  let depth = 0, end = start;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

// `var <name> = [...];` nhiều dòng (STATUS_RULES) hoặc `{...};` 1 dòng (SITE_SUFFIX_).
// Không hỗ trợ object lồng nhiều dòng — đủ cho const hiện dùng trong test.
function extractVar(src, name) {
  let m = src.match(new RegExp('var ' + name + '\\s*=\\s*\\[[\\s\\S]*?\\];'));
  if (!m) m = src.match(new RegExp('var ' + name + '\\s*=\\s*\\{[^}]*\\};'));
  if (!m) throw new Error('missing var ' + name);
  return m[0];
}

// Sandbox từ các đoạn source. run(fn, args) trả JSON chuẩn hóa — Date thành
// {y,m,d,hh,mi,ss} (wall-clock fields) để so trực tiếp với kết quả Python.
function makeSandbox(parts) {
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(parts.join('\n'), sb);
  vm.runInContext([
    'function __run__(fn, args) {',
    '  var r = globalThis[fn].apply(null, args);',
    '  if (r && typeof r.getTime === "function") {',
    '    return JSON.stringify({ y: r.getFullYear(), m: r.getMonth() + 1, d: r.getDate(), hh: r.getHours(), mi: r.getMinutes(), ss: r.getSeconds() });',
    '  }',
    '  return JSON.stringify(r === undefined ? null : r);',
    '}',
  ].join('\n'), sb);
  sb.run = (fn, args) => vm.runInContext('__run__(' + JSON.stringify(fn) + ',' + JSON.stringify(args) + ')', sb);
  return sb;
}

module.exports = { extractFn, extractVar, makeSandbox };
