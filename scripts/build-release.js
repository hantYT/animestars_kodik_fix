#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const packageInfo = require('../extension/package.json');

console.log('🚀 Building release for version', packageInfo.version);

// Создаем папку для релизов
const releaseDir = path.join(__dirname, '..', 'releases');
if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir);
}

// Собираем расширение
console.log('📦 Building extension...');
process.chdir(path.join(__dirname, '..', 'extension'));
execSync('npm run build', { stdio: 'inherit' });

// Создаем архив
const filename = `animestars-kodik-optimizer-v${packageInfo.version}.zip`;
const output = fs.createWriteStream(path.join(releaseDir, filename));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const size = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`✅ Release created: ${filename} (${size} MB)`);
  console.log(`📁 Location: releases/${filename}`);
  console.log('');
  console.log('📋 Next steps:');
  console.log('1. Test the extension manually');
  console.log('2. Update CHANGELOG.md');
  console.log('3. Commit and push changes');
  console.log('4. Create GitHub release');
  console.log('5. Upload the ZIP file');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Добавляем файлы в архив
const distPath = path.join(__dirname, '..', 'extension', 'dist');
archive.directory(distPath, false);

archive.finalize();
