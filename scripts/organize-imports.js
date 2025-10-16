#!/usr/bin/env node

/**
 * Import Organization Script
 *
 * Organizes imports in all JavaScript files according to 4-level hierarchy:
 * 1. Node.js built-in modules (fs, path, crypto, etc.)
 * 2. External dependencies (express, mongoose, ccxt, etc.)
 * 3. Internal utilities and services (./utils/*, ./services/*)
 * 4. Models and types (./models/*, ./types/*)
 *
 * Usage: node scripts/organize-imports.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Node.js built-in modules (non-exhaustive list of common ones)
const BUILTIN_MODULES = new Set([
  'fs',
  'path',
  'crypto',
  'http',
  'https',
  'url',
  'util',
  'stream',
  'events',
  'os',
  'child_process',
  'assert',
  'buffer',
  'zlib',
  'readline',
  'querystring',
  'dns',
  'net',
  'tls',
  'dgram',
  'cluster',
  'process',
  'v8',
  'vm',
  'timers',
  'console',
  'module'
]);

/**
 * Categorize a require statement into one of 4 levels
 */
function categorizeRequire(line) {
  // Extract module name from require statement
  const match = line.match(/require\(['"]([^'"]+)['"]\)/);
  if (!match) return null;

  const moduleName = match[1];

  // Level 1: Node.js built-in modules
  const baseModule = moduleName.split('/')[0];
  if (BUILTIN_MODULES.has(baseModule) || BUILTIN_MODULES.has(moduleName)) {
    return { level: 1, line, moduleName };
  }

  // Level 4: Models and types
  if (
    moduleName.startsWith('./models/') ||
    moduleName.startsWith('../models/') ||
    moduleName.startsWith('../../models/')
  ) {
    return { level: 4, line, moduleName };
  }

  if (
    moduleName.startsWith('./types/') ||
    moduleName.startsWith('../types/') ||
    moduleName.startsWith('../../types/')
  ) {
    return { level: 4, line, moduleName };
  }

  // Level 3: Internal utilities and services
  if (moduleName.startsWith('./') || moduleName.startsWith('../') || moduleName.startsWith('../../')) {
    return { level: 3, line, moduleName };
  }

  // Level 2: External dependencies (npm packages)
  return { level: 2, line, moduleName };
}

/**
 * Organize imports in a file
 */
function organizeImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Find import block (starts at first require, ends at last require before code)
  let importStartIdx = -1;
  let importEndIdx = -1;
  const imports = [];
  const nonImportLines = [];

  // Special case: dotenv.config() should stay at the top
  let dotenvLine = null;
  let afterDotenvBlankLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle dotenv.config() specially
    if (line.includes('dotenv') && line.includes('config()')) {
      dotenvLine = line;
      // Capture blank lines after dotenv
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') {
        afterDotenvBlankLines.push(lines[j]);
        j++;
      }
      i = j - 1; // Skip past blank lines
      continue;
    }

    // Check if line contains a require statement
    if (line.includes('require(') && !line.trim().startsWith('//')) {
      if (importStartIdx === -1) {
        importStartIdx = i;
      }
      importEndIdx = i;

      const category = categorizeRequire(line);
      if (category) {
        imports.push(category);
      } else {
        imports.push({ level: 5, line, moduleName: '' }); // Unknown, put at end
      }
    } else if (importStartIdx !== -1 && importEndIdx !== -1) {
      // We've passed the import block
      // Capture remaining lines
      nonImportLines.push(...lines.slice(i));
      break;
    } else if (dotenvLine === null) {
      // Before imports started
      nonImportLines.push(line);
    }
  }

  // If no imports found, return original content
  if (imports.length === 0) {
    return content;
  }

  // Group imports by level
  const level1 = imports.filter(imp => imp.level === 1);
  const level2 = imports.filter(imp => imp.level === 2);
  const level3 = imports.filter(imp => imp.level === 3);
  const level4 = imports.filter(imp => imp.level === 4);
  const level5 = imports.filter(imp => imp.level === 5);

  // Sort within each level alphabetically by module name
  [level1, level2, level3, level4, level5].forEach(group => {
    group.sort((a, b) => a.moduleName.localeCompare(b.moduleName));
  });

  // Build new content
  const organized = [];

  // Add pre-import lines (comments, etc.)
  const preImportLines = nonImportLines.slice(0, importStartIdx - (dotenvLine ? 2 : 0));
  if (preImportLines.length > 0 && preImportLines.some(l => l.trim())) {
    organized.push(...preImportLines);
  }

  // Add dotenv.config() at the very top if present
  if (dotenvLine) {
    organized.push(dotenvLine);
    organized.push(...afterDotenvBlankLines);
  }

  // Add organized imports with blank lines between levels
  if (level1.length > 0) {
    organized.push('// Node.js built-in modules');
    organized.push(...level1.map(imp => imp.line));
    organized.push('');
  }

  if (level2.length > 0) {
    organized.push('// External dependencies');
    organized.push(...level2.map(imp => imp.line));
    organized.push('');
  }

  if (level3.length > 0) {
    organized.push('// Internal utilities and services');
    organized.push(...level3.map(imp => imp.line));
    organized.push('');
  }

  if (level4.length > 0) {
    organized.push('// Models and types');
    organized.push(...level4.map(imp => imp.line));
    organized.push('');
  }

  if (level5.length > 0) {
    organized.push(...level5.map(imp => imp.line));
    organized.push('');
  }

  // Add rest of the file
  const restOfFile = nonImportLines.slice(importStartIdx - (dotenvLine ? 2 : 0));
  organized.push(...restOfFile);

  return organized.join('\n');
}

/**
 * Find all JavaScript files recursively
 */
function findJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules, dist, build
      if (!['node_modules', 'dist', 'build', '.git'].includes(file)) {
        findJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Main execution
 */
function main() {
  console.log('🔄 Organizing imports across all JavaScript files...\n');

  const projectRoot = path.resolve(__dirname, '..');
  const srcDir = path.join(projectRoot, 'src');
  const testsDir = path.join(projectRoot, 'tests');
  const scriptsDir = path.join(projectRoot, 'scripts');

  // Find all JS files
  const srcFiles = findJsFiles(srcDir);
  const testFiles = findJsFiles(testsDir);
  const scriptFiles = findJsFiles(scriptsDir).filter(f => !f.includes('organize-imports.js')); // Exclude self

  const allFiles = [...srcFiles, ...testFiles, ...scriptFiles];

  console.log(`Found ${allFiles.length} JavaScript files to process\n`);

  let processedCount = 0;
  let changedCount = 0;

  allFiles.forEach(filePath => {
    try {
      const originalContent = fs.readFileSync(filePath, 'utf8');
      const organizedContent = organizeImports(filePath);

      if (originalContent !== organizedContent) {
        fs.writeFileSync(filePath, organizedContent, 'utf8');
        console.log(`✅ Organized: ${path.relative(projectRoot, filePath)}`);
        changedCount++;
      }

      processedCount++;
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error.message);
    }
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Processed: ${processedCount} files`);
  console.log(`   Modified: ${changedCount} files`);
  console.log(`   Unchanged: ${processedCount - changedCount} files`);

  if (changedCount > 0) {
    console.log(`\n✨ Import organization complete!`);
    console.log(`\n💡 Next step: Run Prettier to format the organized imports`);
    console.log(`   npx prettier --write "src/**/*.js" "tests/**/*.js" "scripts/**/*.js"`);
  } else {
    console.log(`\n✅ All imports already organized!`);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { organizeImports, categorizeRequire };
