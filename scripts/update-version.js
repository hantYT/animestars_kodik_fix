#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const packagePath = path.join(__dirname, '..', 'extension', 'package.json');
const manifestPath = path.join(__dirname, '..', 'extension', 'src', 'manifest.json');

function updateVersion(newVersion) {
  // Обновляем package.json
  const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageData.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2) + '\n');

  // Обновляем manifest.json
  const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifestData.version = newVersion;
  fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2) + '\n');

  console.log(`✅ Version updated to ${newVersion}`);
  console.log('📝 Updated files:');
  console.log('  - extension/package.json');
  console.log('  - extension/src/manifest.json');
}

rl.question('Enter new version (current: ' + JSON.parse(fs.readFileSync(packagePath, 'utf8')).version + '): ', (version) => {
  if (version && /^\d+\.\d+\.\d+$/.test(version)) {
    updateVersion(version);
  } else {
    console.log('❌ Invalid version format. Use semantic versioning (e.g., 1.0.0)');
  }
  rl.close();
});
