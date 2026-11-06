const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Tier 1 - Feature 13: End-to-End Test Suite & Verification Architecture', async (t) => {
  await t.test('13.1 Test Infrastructure document exists and covers all testing methodologies', () => {
    const infraPath = path.resolve(__dirname, '../../../TEST_INFRA.md');
    assert.ok(fs.existsSync(infraPath), 'TEST_INFRA.md must exist in repository root');

    const content = fs.readFileSync(infraPath, 'utf8');
    assert.match(content, /Opaque-Box/i, 'Must define Opaque-Box methodology');
    assert.match(content, /Category-Partition/i, 'Must define Category-Partition methodology');
    assert.match(content, /Boundary Value Analysis/i, 'Must define Boundary Value Analysis');
    assert.match(content, /Pairwise Combinatorial/i, 'Must define Pairwise Combinatorial testing');
    assert.match(content, /Real-World Application Scenarios/i, 'Must define Real-World Application Scenarios');
  });

  await t.test('13.2 Directory structure contains dedicated tiers', () => {
    const testsDir = path.resolve(__dirname, '../..');
    assert.ok(fs.existsSync(path.join(testsDir, 'e2e/tier1_features')));
    assert.ok(fs.existsSync(path.join(testsDir, 'e2e/tier2_boundaries')));
    assert.ok(fs.existsSync(path.join(testsDir, 'e2e/tier3_combinations')));
    assert.ok(fs.existsSync(path.join(testsDir, 'e2e/tier4_scenarios')));
  });
});
