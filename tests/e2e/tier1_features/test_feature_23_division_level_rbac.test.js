const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAccess } = require('../helpers/rbac_oracle');

test('Tier 1 - Feature 23: Division & Level (L1-L5) RBAC Access Matrix', async (t) => {
  await t.test('23.1 Publik documents: open to all divisions and all levels (L1-L5)', () => {
    const levels = ['L1', 'L2', 'L3', 'L4', 'L5'];
    const divisions = ['HR', 'Finance', 'Legal', 'IT', 'Marketing'];

    for (const div of divisions) {
      for (const lvl of levels) {
        const user = { user_id: 'u1', division: div, level: lvl, role: 'viewer' };
        assert.equal(evaluateAccess(user, 'Publik', 'Legal', 'view').allowed, true);
        assert.equal(evaluateAccess(user, 'Publik', 'Legal', 'download').allowed, true);
      }
    }
  });

  await t.test('23.2 Internal documents: view for all levels, download requires L2+', () => {
    // L1 from any division
    const l1User = { user_id: 'u-l1', division: 'Finance', level: 'L1', role: 'viewer' };
    assert.equal(evaluateAccess(l1User, 'Internal', 'HR', 'view').allowed, true);
    assert.equal(evaluateAccess(l1User, 'Internal', 'HR', 'download').allowed, false);

    // L2 from any division
    const l2User = { user_id: 'u-l2', division: 'Finance', level: 'L2', role: 'viewer' };
    assert.equal(evaluateAccess(l2User, 'Internal', 'HR', 'view').allowed, true);
    assert.equal(evaluateAccess(l2User, 'Internal', 'HR', 'download').allowed, true);
  });

  await t.test('23.3 Rahasia documents (same division): L1 denied, L2 view-only, L3+ view+download', () => {
    const l1Same = { user_id: 'u1', division: 'Legal', level: 'L1', role: 'viewer' };
    assert.equal(evaluateAccess(l1Same, 'Rahasia', 'Legal', 'view').allowed, false);
    assert.equal(evaluateAccess(l1Same, 'Rahasia', 'Legal', 'download').allowed, false);

    const l2Same = { user_id: 'u2', division: 'Legal', level: 'L2', role: 'viewer' };
    assert.equal(evaluateAccess(l2Same, 'Rahasia', 'Legal', 'view').allowed, true);
    assert.equal(evaluateAccess(l2Same, 'Rahasia', 'Legal', 'download').allowed, false);

    const l3Same = { user_id: 'u3', division: 'Legal', level: 'L3', role: 'viewer' };
    assert.equal(evaluateAccess(l3Same, 'Rahasia', 'Legal', 'view').allowed, true);
    assert.equal(evaluateAccess(l3Same, 'Rahasia', 'Legal', 'download').allowed, true);
  });

  await t.test('23.4 Rahasia documents (cross-division): strictly denied for all levels (L1-L5)', () => {
    const levels = ['L1', 'L2', 'L3', 'L4', 'L5'];
    for (const lvl of levels) {
      const crossUser = { user_id: 'u-cross', division: 'HR', level: lvl, role: 'viewer' };
      const viewRes = evaluateAccess(crossUser, 'Rahasia', 'Finance', 'view');
      assert.equal(viewRes.allowed, false, `Level ${lvl} cross-division view must be denied`);
      assert.match(viewRes.reason, /restricted to Finance division/i);

      const downloadRes = evaluateAccess(crossUser, 'Rahasia', 'Finance', 'download');
      assert.equal(downloadRes.allowed, false);
    }
  });

  await t.test('23.5 Sangat Rahasia documents: L1-L3 denied, L4 view-only, L5 view+download', () => {
    const l3Exec = { user_id: 'u3', division: 'Executive', level: 'L3', role: 'viewer' };
    assert.equal(evaluateAccess(l3Exec, 'Sangat Rahasia', 'Executive', 'view').allowed, false);

    const l4Exec = { user_id: 'u4', division: 'Executive', level: 'L4', role: 'viewer' };
    assert.equal(evaluateAccess(l4Exec, 'Sangat Rahasia', 'Executive', 'view').allowed, true);
    assert.equal(evaluateAccess(l4Exec, 'Sangat Rahasia', 'Executive', 'download').allowed, false);

    const l5Exec = { user_id: 'u5', division: 'Executive', level: 'L5', role: 'viewer' };
    assert.equal(evaluateAccess(l5Exec, 'Sangat Rahasia', 'Executive', 'view').allowed, true);
    assert.equal(evaluateAccess(l5Exec, 'Sangat Rahasia', 'Executive', 'download').allowed, true);
  });

  await t.test('23.6 Executive Override: Admin or Division ALL L5 possesses universal access', () => {
    const adminUser = { user_id: 'u-admin', division: 'ALL', level: 'L5', role: 'admin' };
    assert.equal(evaluateAccess(adminUser, 'Sangat Rahasia', 'Finance', 'view').allowed, true);
    assert.equal(evaluateAccess(adminUser, 'Sangat Rahasia', 'Finance', 'download').allowed, true);
  });
});
