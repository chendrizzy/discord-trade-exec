#!/usr/bin/env node
/**
 * Batched Test Runner
 *
 * Runs Jest tests in batches to prevent memory exhaustion.
 * Memory threshold identified: 4-5 test files can run safely together.
 */

const { spawnSync } = require('child_process');
const { readdirSync, statSync } = require('fs');
const { join } = require('path');

const BATCH_SIZE = 4; // Safe batch size identified through testing
const NODE_OPTIONS = '--experimental-vm-modules --max-old-space-size=8192 --expose-gc';

// Find all test files recursively
function findTestFiles(dir, files = []) {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      findTestFiles(fullPath, files);
    } else if (entry.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

// Split files into batches
function batchFiles(files, batchSize) {
  const batches = [];
  for (let i = 0; i < files.length; i += batchSize) {
    batches.push(files.slice(i, i + batchSize));
  }
  return batches;
}

// Run a single batch
function runBatch(files, batchNum, totalBatches) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📦 Running Batch ${batchNum}/${totalBatches} (${files.length} files)`);
  console.log(`${'='.repeat(80)}\n`);

  const args = [
    '--no-coverage',
    '--runInBand',
    ...files
  ];

  const result = spawnSync('npx', ['jest', ...args], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS
    }
  });

  if (result.status === 0) {
    return { success: true, files };
  } else {
    console.error(`\n❌ Batch ${batchNum} failed with exit code ${result.status}`);
    return { success: false, files, exitCode: result.status };
  }
}

// Main execution
function main() {
  console.log('🚀 Starting Batched Test Runner\n');

  // Find test files in both locations
  const brokerTests = findTestFiles('src/brokers/adapters/__tests__');
  const unitTests = findTestFiles('tests/unit');
  const integrationTests = findTestFiles('tests/integration');
  const allFiles = [...brokerTests, ...unitTests, ...integrationTests];

  console.log(`📊 Found ${allFiles.length} test files`);
  console.log(`   - Broker tests: ${brokerTests.length}`);
  console.log(`   - Unit tests: ${unitTests.length}`);
  console.log(`   - Integration tests: ${integrationTests.length}`);
  console.log(`📦 Batch size: ${BATCH_SIZE} files\n`);

  const batches = batchFiles(allFiles, BATCH_SIZE);
  console.log(`🔢 Total batches: ${batches.length}\n`);

  const results = [];
  let passedBatches = 0;
  let failedBatches = 0;

  for (let i = 0; i < batches.length; i++) {
    const result = runBatch(batches[i], i + 1, batches.length);
    results.push(result);

    if (result.success) {
      passedBatches++;
    } else {
      failedBatches++;
    }
  }

  // Final summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 Final Summary');
  console.log(`${'='.repeat(80)}\n`);
  console.log(`✅ Passed batches: ${passedBatches}/${batches.length}`);
  console.log(`❌ Failed batches: ${failedBatches}/${batches.length}`);
  console.log(`📁 Total files tested: ${allFiles.length}`);

  if (failedBatches > 0) {
    console.log(`\n❌ Failed batches:`);
    results.filter(r => !r.success).forEach((r, i) => {
      console.log(`\nBatch ${i + 1}:`);
      r.files.forEach(f => console.log(`  - ${f}`));
    });
    process.exit(1);
  }

  console.log(`\n✅ All tests passed!`);
  process.exit(0);
}

main();
