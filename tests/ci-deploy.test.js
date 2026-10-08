const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract CI deploy: ghim production deployment qua secret GAS_DEPLOYMENT_ID
// (deployment ID trong URL /exec chinh thuc), fallback heuristic cu khi chua set.
// Ly do: kieu chon theo version cao nhat de mo them deployment moi moi push,
// gay loan 3 deployment song song (10/2026).
test('ci: uu tien GAS_DEPLOYMENT_ID, fallback deployment version cao nhat', () => {
  const y = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
  assert.ok(y.includes('secrets.GAS_DEPLOYMENT_ID'), 'doc secret ghim deployment');
  assert.ok(y.includes('clasp deployments --json'), 'fallback heuristic van giu');
  assert.ok(y.includes('clasp redeploy'), 'redeploy vao deployment hien co, khong de moi');
  const pin = y.indexOf('secrets.GAS_DEPLOYMENT_ID');
  const fb = y.indexOf('clasp deployments --json');
  assert.ok(pin > 0 && fb > pin, 'uu tien secret truoc, heuristic sau');
});
