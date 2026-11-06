#!/usr/bin/env node
/**
 * BrilianIDMS Unified E2E Test Suite Runner
 * Executes all multi-tier tests with TAP / Spec reporting and exit status code.
 */

const { run } = require('node:test');
const { spec } = require('node:test/reporters');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = __dirname;

function findTestFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(findTestFiles(fullPath));
    } else if (file.endsWith('.test.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

async function main() {
  console.log('===============================================================');
  console.log('   BrilianIDMS End-to-End Test Suite Orchestrator             ');
  console.log('   Runtime: Node.js ' + process.version + ' (Zero-External-Dependencies)');
  console.log('===============================================================\n');

  // Discover all test files across all tiers
  const tierDirs = [
    path.join(ROOT_DIR, 'tier1_features'),
    path.join(ROOT_DIR, 'tier2_boundaries'),
    path.join(ROOT_DIR, 'tier3_combinations'),
    path.join(ROOT_DIR, 'tier4_scenarios')
  ];

  let testFiles = [];
  for (const tDir of tierDirs) {
    if (fs.existsSync(tDir)) {
      testFiles = testFiles.concat(findTestFiles(tDir));
    }
  }

  // Filter if tier flag provided (e.g. node runner.js --tier=1)
  const tierArg = process.argv.find(arg => arg.startsWith('--tier='));
  if (tierArg) {
    const tierNum = tierArg.split('=')[1];
    testFiles = testFiles.filter(f => f.includes(`tier${tierNum}_`));
    console.log(`[FILTER] Executing only Tier ${tierNum} tests.`);
  }

  console.log(`Discovered ${testFiles.length} test suite files:`);
  testFiles.forEach(f => console.log(`  - ${path.relative(ROOT_DIR, f)}`));
  console.log('\nRunning test suites...\n');

  const startTime = Date.now();
  let passCount = 0;
  let failCount = 0;

  const testStream = run({
    files: testFiles,
    concurrency: false // Run sequentially for clean console output
  });

  testStream.on('test:pass', (t) => {
    passCount++;
  });

  testStream.on('test:fail', (t) => {
    failCount++;
  });

  testStream.compose(new spec()).pipe(process.stdout);

  testStream.on('end', () => {
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n===============================================================');
    console.log(`   E2E Test Execution Summary (${durationSec}s)`);
    console.log(`   Suites: ${testFiles.length}`);
    console.log(`   Passed: ${passCount}`);
    console.log(`   Failed: ${failCount}`);
    console.log('===============================================================');

    if (failCount > 0) {
      console.error('\n❌ TEST RUN FAILED: One or more assertions failed.\n');
      process.exit(1);
    } else {
      console.log('\n✅ ALL E2E TEST TIERS PASSED CLEANLY.\n');
      process.exit(0);
    }
  });
}

main().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
