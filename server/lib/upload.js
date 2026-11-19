/**
 * Chính sách tải tệp lên dùng chung cho CMS.
 *
 * Một nơi duy nhất định nghĩa loại tệp được phép, dung lượng tối đa và cách
 * chuẩn hóa MIME để máy chủ và giao diện không lệch nhau.
 *
 * Nguyên tắc: chỉ nhận các định dạng nội dung tĩnh (ảnh raster, tài liệu văn
 * phòng, video/âm thanh). KHÔNG nhận HTML, SVG hay mã thực thi vì các tệp này
 * được phục vụ cùng origin và có thể dẫn tới stored XSS.
 */
'use strict';

/** Dung lượng tối đa của một tệp được lưu (byte) – 25 MB */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Tổng dung lượng body multipart tối đa (byte).
 * Body có thể chứa nhiều tệp trong một lần gửi, nên trần này rộng hơn giới hạn
 * từng tệp; giới hạn từng tệp được kiểm tra riêng khi tách xong các phần.
 */
const MAX_BODY_BYTES = 200 * 1024 * 1024;

/**
 * Loại tệp được phép: phần mở rộng -> { type, mimes[] }
 * `type` dùng cho thư viện tài nguyên (media.type).
 */
const ALLOWED = {
  // Ảnh raster – an toàn khi phục vụ trực tiếp
  jpg: { type: 'image', mimes: ['image/jpeg'] },
  jpeg: { type: 'image', mimes: ['image/jpeg'] },
  png: { type: 'image', mimes: ['image/png'] },
  webp: { type: 'image', mimes: ['image/webp'] },
  gif: { type: 'image', mimes: ['image/gif'] },
  avif: { type: 'image', mimes: ['image/avif'] },
  bmp: { type: 'image', mimes: ['image/bmp', 'image/x-ms-bmp'] },
  ico: { type: 'image', mimes: ['image/x-icon', 'image/vnd.microsoft.icon'] },

  // Tài liệu văn phòng
  pdf: { type: 'document', mimes: ['application/pdf'] },
  doc: { type: 'document', mimes: ['application/msword', 'application/vnd.ms-word'] },
  docx: { type: 'document', mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  xls: { type: 'document', mimes: ['application/vnd.ms-excel'] },
  xlsx: { type: 'document', mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] },
  ppt: { type: 'document', mimes: ['application/vnd.ms-powerpoint'] },
  pptx: { type: 'document', mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'] },
  csv: { type: 'document', mimes: ['text/csv', 'application/csv'] },
  txt: { type: 'document', mimes: ['text/plain'] },

  // Gói nén
  zip: { type: 'document', mimes: ['application/zip', 'application/x-zip-compressed'] },

  // Video
  mp4: { type: 'video', mimes: ['video/mp4'] },
  webm: { type: 'video', mimes: ['video/webm'] },
  m4v: { type: 'video', mimes: ['video/x-m4v', 'video/mp4'] },
  ogv: { type: 'video', mimes: ['video/ogg'] },

  // Âm thanh
  mp3: { type: 'audio', mimes: ['audio/mpeg'] },
  wav: { type: 'audio', mimes: ['audio/wav', 'audio/x-wav'] },
  ogg: { type: 'audio', mimes: ['audio/ogg'] },
};

/** Định dạng cố ý bị từ chối, kèm lý do để báo lỗi rõ ràng */
const BLOCKED = {
  html: 'Tệp HTML không được phép tải lên vì có thể chạy mã trong trình duyệt.',
  htm: 'Tệp HTML không được phép tải lên vì có thể chạy mã trong trình duyệt.',
  xhtml: 'Tệp HTML không được phép tải lên vì có thể chạy mã trong trình duyệt.',
  svg: 'Tệp SVG không được phép tải lên vì có thể chứa mã chạy được. Hãy xuất sang PNG/WEBP.',
  js: 'Tệp mã kịch bản không được phép tải lên.',
  mjs: 'Tệp mã kịch bản không được phép tải lên.',
  php: 'Tệp thực thi phía máy chủ không được phép tải lên.',
  phtml: 'Tệp thực thi phía máy chủ không được phép tải lên.',
  asp: 'Tệp thực thi phía máy chủ không được phép tải lên.',
  aspx: 'Tệp thực thi phía máy chủ không được phép tải lên.',
  jsp: 'Tệp thực thi phía máy chủ không được phép tải lên.',
  exe: 'Tệp chạy trực tiếp không được phép tải lên.',
  dll: 'Tệp chạy trực tiếp không được phép tải lên.',
  bat: 'Tệp lệnh không được phép tải lên.',
  cmd: 'Tệp lệnh không được phép tải lên.',
  ps1: 'Tệp lệnh không được phép tải lên.',
  sh: 'Tệp lệnh không được phép tải lên.',
};

/** Danh sách phần mở rộng cho thuộc tính `accept` của input file */
function acceptAttribute() {
  return Object.keys(ALLOWED).map((ext) => `.${ext}`).join(',');
}

/** Phần mở rộng (không dấu chấm, chữ thường) */
function extOf(name) {
  const clean = String(name || '').split(/[\\/]/).pop() || '';
  const idx = clean.lastIndexOf('.');
  if (idx <= 0 || idx === clean.length - 1) return '';
  return clean.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Kiểm tra tên tệp và dung lượng.
 * @returns {{ok: true, ext: string, type: string} | {ok: false, message: string}}
 */
function checkFile(name, size) {
  const ext = extOf(name);
  if (!ext) return { ok: false, message: 'Tệp không có phần mở rộng hợp lệ.' };
  if (Object.prototype.hasOwnProperty.call(BLOCKED, ext)) return { ok: false, message: BLOCKED[ext] };
  const rule = ALLOWED[ext];
  if (!rule) {
    return { ok: false, message: `Định dạng .${ext} không được hỗ trợ. Chỉ nhận: ảnh (JPG, PNG, WEBP, GIF), tài liệu (PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX), video (MP4, WEBM) và âm thanh (MP3, WAV).` };
  }
  if (typeof size === 'number') {
    if (size <= 0) return { ok: false, message: 'Tệp rỗng hoặc không đọc được.' };
    if (size > MAX_FILE_BYTES) {
      return { ok: false, message: `Tệp vượt quá dung lượng cho phép (${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB).` };
    }
  }
  return { ok: true, ext, type: rule.type };
}

/**
 * Xác định MIME chuẩn để lưu: tin theo phần mở rộng đã được allow-list.
 * MIME do trình duyệt khai có thể sai/giả mạo nên chỉ dùng làm gợi ý.
 */
function normalizeMime(ext, declared) {
  const rule = ALLOWED[ext];
  if (!rule) return 'application/octet-stream';
  const declaredClean = String(declared || '').split(';')[0].trim().toLowerCase();
  if (declaredClean && rule.mimes.includes(declaredClean)) return declaredClean;
  return rule.mimes[0];
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_BODY_BYTES,
  ALLOWED,
  BLOCKED,
  acceptAttribute,
  extOf,
  checkFile,
  normalizeMime,
};
