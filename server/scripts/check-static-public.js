'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SNAPSHOT_PATH = path.join(ROOT, 'public-data', 'public.json');
const MEDIA_DIR = path.join(ROOT, 'public-data', 'media');
const MEDIA_REFERENCE_PATTERN = /public-data\/media\/([^"'`\s?#)<>]+)/g;
const GITHUB_MAX_FILE_BYTES = 100 * 1024 * 1024;
const COLLECTIONS = [
  'articles',
  'categories',
  'legalDocuments',
  'systemCategories',
  'events',
  'agencies',
  'statistics',
  'supportFacilities',
  'banners',
  'notifications',
];

function collectMediaReferences(value, references) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectMediaReferences(item, references));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectMediaReferences(item, references));
    return;
  }
  if (typeof value !== 'string') return;

  for (const match of value.matchAll(MEDIA_REFERENCE_PATTERN)) {
    references.add(`public-data/media/${match[1]}`);
  }
}

function readAndValidateSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error('Không tìm thấy public-data/public.json. Hãy chạy export dữ liệu PUBLIC trước.');
  }

  let snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`public-data/public.json không phải JSON hợp lệ: ${error.message}`);
  }

  if (!snapshot || typeof snapshot !== 'object' || !Number.isFinite(Date.parse(snapshot.generatedAt || ''))) {
    throw new Error('Snapshot thiếu generatedAt hợp lệ.');
  }
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(snapshot[collection])) {
      throw new Error(`Snapshot thiếu danh sách PUBLIC hợp lệ: ${collection}.`);
    }
  }

  const references = new Set();
  collectMediaReferences(snapshot, references);
  const invalidFiles = [];
  if (fs.existsSync(MEDIA_DIR)) {
    const orphanOrOversized = [];
    const walkMedia = (dir) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walkMedia(full);
        const stat = fs.statSync(full);
        if (stat.size === 0) orphanOrOversized.push(path.relative(ROOT, full).replace(/\\/g, '/') + ' (tệp rỗng)');
        if (stat.size > GITHUB_MAX_FILE_BYTES) orphanOrOversized.push(path.relative(ROOT, full).replace(/\\/g, '/') + ' (vượt 100 MB)');
      });
    };
    walkMedia(MEDIA_DIR);
    invalidFiles.push(...orphanOrOversized);
  }
  for (const reference of references) {
    const filePath = path.resolve(ROOT, ...reference.split('/'));
    const mediaRelativePath = path.relative(MEDIA_DIR, filePath);
    if (mediaRelativePath === '..' || mediaRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(mediaRelativePath)) {
      invalidFiles.push(`${reference} (đường dẫn không hợp lệ)`);
      continue;
    }

    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size === 0) invalidFiles.push(`${reference} (không phải tệp hoặc tệp rỗng)`);
      if (stat.isFile() && stat.size > GITHUB_MAX_FILE_BYTES) invalidFiles.push(`${reference} (vượt 100 MB; GitHub không nhận file trực tiếp)`);
    } catch {
      invalidFiles.push(`${reference} (không tồn tại)`);
    }
  }

  if (invalidFiles.length > 0) {
    throw new Error(`Media được snapshot tham chiếu bị thiếu hoặc không hợp lệ:\n${invalidFiles.join('\n')}`);
  }

  return { snapshot, references };
}

function verifyGitTracking(references) {
  let trackedFiles;
  try {
    trackedFiles = execFileSync(
      'git',
      ['-c', 'core.quotepath=false', 'ls-files', '--', 'public-data/'],
      { cwd: ROOT, encoding: 'utf8' },
    ).split(/\r?\n/).filter(Boolean);
  } catch (error) {
    throw new Error(`Không thể xác nhận tệp trong Git index: ${error.message}`);
  }

  const tracked = new Set(trackedFiles);
  const missing = [];
  if (!tracked.has('public-data/public.json')) missing.push('public-data/public.json');
  for (const reference of references) {
    if (!tracked.has(reference)) missing.push(reference);
  }
  if (missing.length > 0) {
    throw new Error(`Các tệp PUBLIC sau chưa được Git theo dõi/stage:\n${missing.join('\n')}`);
  }
}

try {
  const { snapshot, references } = readAndValidateSnapshot();
  if (process.argv.includes('--check-git')) verifyGitTracking(references);

  console.log(
    `Snapshot PUBLIC hợp lệ: ${snapshot.articles.length} bài viết, `
    + `${snapshot.legalDocuments.length} văn bản pháp luật, `
    + `${references.size} media tồn tại và không rỗng.`,
  );
  if (process.argv.includes('--check-git')) {
    console.log('public.json và mọi media được tham chiếu đều có trong Git index.');
  }
} catch (error) {
  console.error(`Kiểm tra snapshot PUBLIC thất bại: ${error.message}`);
  process.exitCode = 1;
}
