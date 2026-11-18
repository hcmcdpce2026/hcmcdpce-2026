import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadQaCredentials() {
  const jsonPath = path.join(ROOT, 'server', 'data', 'qa-creds.json');
  const textPath = path.join(ROOT, 'server', 'data', 'credentials.local.txt');

  if (process.env.QA_CREDENTIALS_JSON) {
    const credentials = JSON.parse(process.env.QA_CREDENTIALS_JSON);
    if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
      throw new Error('QA_CREDENTIALS_JSON phải là JSON dạng username: password.');
    }
    return credentials;
  }

  if (fs.existsSync(jsonPath)) {
    const credentials = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
      throw new Error('server/data/qa-creds.json không đúng định dạng.');
    }
    return credentials;
  }

  if (fs.existsSync(textPath)) {
    const credentials = {};
    fs.readFileSync(textPath, 'utf8').split(/\r?\n/).forEach((line) => {
      const [password, username] = line.trim().split(/\s+/);
      if (username && username.includes('.') && password) credentials[username] = password;
    });
    if (Object.keys(credentials).length) return credentials;
  }

  throw new Error(
    'Thiếu thông tin đăng nhập QA. Chạy seed CLI để tạo credentials.local.txt hoặc cung cấp QA_CREDENTIALS_JSON; không ghi mật khẩu vào mã nguồn.'
  );
}
