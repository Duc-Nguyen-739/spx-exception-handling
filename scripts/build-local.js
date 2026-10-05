// build-local stub — sinh file build tối thiểu để test:chrome có file mở.
const fs = require('fs');
fs.writeFileSync('index.local.html', fs.readFileSync('index.html', 'utf8'));
console.log('build:local stub OK');
