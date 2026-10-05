// build-local — sinh index.local.html cho test:chrome (file://).
// App này single-file (không tách css/js include) nên build = copy + kiểm tra
// không sót directive GAS. KHỚP spx-diem-danh/scripts/build-local.js (module build()).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
function build() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (/<\?!=/.test(html)) throw new Error('build-local: còn sót directive GAS <?!= ... ?>');
  fs.writeFileSync(path.join(ROOT, 'index.local.html'), html, 'utf8');
  return html;
}
if (require.main === module) { build(); console.log('build:local OK'); }
module.exports = { build };
