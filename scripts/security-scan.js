/**
 * security-scan.js – Quét nhanh các rủi ro phổ biến trước khi commit.
 *   node scripts/security-scan.js
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'artifacts', 'backups', 'archive']);
const files = [];

(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    if (SKIP_DIRS.has(e.name)) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|html|json|md|sql|ps1|example)$/.test(e.name) || e.name === '.env.example') files.push(p);
  });
})(ROOT);

const checks = [
  {
    name: 'Mật khẩu gán trực tiếp trong mã',
    re: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    // Loại trừ: tệp mẫu, mật khẩu kiểm thử trong bộ test, thông báo lỗi
    ignore: [/\.env\.example/, /test-api\.js/, /seed\.js/, /retype/i, /placeholder/i, /example/i, /AAA/i],
    severity: 'CAO',
  },
  {
    name: 'API key / secret cứng',
    re: /(?:api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/gi,
    ignore: [/\.env\.example/, /SESSION_SECRET/],
    severity: 'CAO',
  },
  {
    name: 'Chuỗi kết nối có mật khẩu',
    re: /(?:mysql|postgres|mongodb):\/\/[^:]+:[^@\s]+@/gi,
    ignore: [],
    severity: 'CAO',
  },
  {
    name: 'innerHTML với biến chưa escape (cảnh báo)',
    re: /innerHTML\s*=\s*(?!`\s*$)[^;]*\$\{[^}]*\}/g,
    ignore: [/\besc\(/, /\ba\.body\b/, /\butil\.escape\(/, /\butil\.formatNumber\(/],
    severity: 'THẤP',
    limit: 3,
  },
  {
    name: 'localStorage chứa mật khẩu',
    re: /localStorage\.setItem\([^)]*password[^)]*\)/gi,
    ignore: [],
    severity: 'CAO',
  },
  {
    name: 'eval() hoặc new Function với dữ liệu động',
    re: /eval\s*\(|new Function\s*\(\s*[a-zA-Z_$]/g,
    ignore: [/scripts\//, /security-scan/],
    severity: 'TRUNG BÌNH',
  },
  {
    name: 'SQL nối chuỗi từ dữ liệu người dùng',
    // Chỉ cảnh báo khi giá trị nội suy TRỰC TIẾP là biến từ request.
    // Tên bảng/cột lấy từ hằng trong mã là an toàn (không nội suy từ req.body/query/params).
    re: /(?:prepare|exec)\s*\(\s*['"`][^'"`]*(?:\$\{\s*(?:req\.|body\.|ctx\.|query\.|params\.|input\.|userInput|name\b|username|title|slug\b))[^'"`]*/g,
    ignore: [],
    severity: 'CAO',
  },
];

let total = 0;
const findings = [];

files.forEach((file) => {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('server\\data') || rel.startsWith('server/data')) return;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  checks.forEach((check) => {
    if (check.ignore.some((re) => re.test(rel))) return;
    lines.forEach((line, idx) => {
      const re = new RegExp(check.re.source, check.re.flags);
      let m;
      let hits = 0;
      while ((m = re.exec(line)) !== null) {
        if (check.ignore.some((ir) => ir.test(line))) continue;
        if (hits >= (check.limit || 1)) break;
        hits += 1;
        total += 1;
        findings.push({
          severity: check.severity,
          check: check.name,
          file: rel,
          line: idx + 1,
          snippet: line.trim().slice(0, 140),
        });
      }
    });
  });
});

console.log('═══════════════════════════════');
console.log('  QUÉT BẢO MẬT MÃ NGUỒN —');
console.log('═══════════════════════════════');
console.log(`  Đã quét ${files.length} tệp.\n`);

if (!findings.length) {
  console.log('  ✓ Không phát hiện mẫu rủi ro nào.');
} else {
  const order = { CAO: 0, 'TRUNG BÌNH': 1, 'THẤP': 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  findings.forEach((f) => {
    console.log(`  [${f.severity}] ${f.check}`);
    console.log(`     ${f.file}:${f.line}`);
    console.log(`     ${f.snippet}\n`);
  });
  console.log(`Tổng: ${findings.length} mục cần xem xét.`);
}

const critical = findings.filter((f) => f.severity === 'CAO');
console.log('\n───────────────────────────────');
console.log(critical.length
  ? `KẾT LUẬN: có ${critical.length} mục mức CAO — phải xử lý trước khi triển khai.`
  : 'KẾT LUẬN: không có mục mức CAO (mật khẩu cứng, secret, SQL nối chuỗi).');
process.exitCode = critical.length ? 1 : 0;
