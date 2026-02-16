const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
};

const MAGIC_BYTES = [
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
];

function detectMimeByMagic(buffer) {
  for (const entry of MAGIC_BYTES) {
    const offset = entry.offset || 0;
    if (buffer.length < offset + entry.bytes.length) continue;
    const match = entry.bytes.every((b, i) => buffer[offset + i] === b);
    if (match) return entry.mime;
  }
  return null;
}

function sanitizeFilename(original) {
  return String(original || 'upload')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'upload';
}

function generateUploadFilename(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const base = sanitizeFilename(path.basename(originalName, ext));
  const stamp = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `${stamp}-${rand}-${base}${ext}`;
}

async function ensureUploadDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function validateImageFile(buffer, filename) {
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds ${MAX_IMAGE_BYTES / (1024 * 1024)} MB limit.`);
  }
  if (buffer.length < 8) {
    throw new Error('File is too small to be a valid image.');
  }
  const detectedMime = detectMimeByMagic(buffer);
  if (!detectedMime || !ALLOWED_IMAGE_TYPES[detectedMime]) {
    throw new Error('File is not a supported image type (JPEG, PNG, GIF, WebP).');
  }
  const ext = path.extname(filename).toLowerCase();
  const allowedExts = ALLOWED_IMAGE_TYPES[detectedMime];
  if (ext && !allowedExts.includes(ext)) {
    throw new Error(`File extension "${ext}" does not match detected type (${detectedMime}).`);
  }
  return detectedMime;
}

/**
 * Parse a multipart/form-data request body.
 * Returns { fields: { name: value }, files: [{ fieldName, filename, mime, buffer }] }
 */
function parseMultipartBody(bodyBuffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  if (!boundaryMatch) throw new Error('Missing multipart boundary.');
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const delimiter = Buffer.from(`--${boundary}`);

  const parts = [];
  let start = bufferIndexOf(bodyBuffer, delimiter, 0);
  if (start < 0) throw new Error('Invalid multipart body.');

  while (true) {
    start += delimiter.length;
    // Check for closing --
    if (bodyBuffer[start] === 0x2D && bodyBuffer[start + 1] === 0x2D) break;
    // Skip \r\n after boundary
    if (bodyBuffer[start] === 0x0D && bodyBuffer[start + 1] === 0x0A) start += 2;

    const headerEnd = bufferIndexOf(bodyBuffer, Buffer.from('\r\n\r\n'), start);
    if (headerEnd < 0) break;

    const headerStr = bodyBuffer.slice(start, headerEnd).toString('utf8');
    const bodyStart = headerEnd + 4;
    const nextBoundary = bufferIndexOf(bodyBuffer, delimiter, bodyStart);
    if (nextBoundary < 0) break;

    // Body ends 2 bytes before next boundary (\r\n)
    const bodyEnd = nextBoundary - 2;
    const partBody = bodyBuffer.slice(bodyStart, Math.max(bodyStart, bodyEnd));

    const disposition = headerStr.match(/Content-Disposition:\s*form-data;\s*(.+)/i);
    if (!disposition) continue;

    const nameMatch = disposition[1].match(/name="([^"]+)"/);
    const filenameMatch = disposition[1].match(/filename="([^"]+)"/);
    const contentTypeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

    if (filenameMatch) {
      parts.push({
        type: 'file',
        fieldName: nameMatch ? nameMatch[1] : 'file',
        filename: filenameMatch[1],
        mime: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
        buffer: partBody,
      });
    } else if (nameMatch) {
      parts.push({
        type: 'field',
        name: nameMatch[1],
        value: partBody.toString('utf8'),
      });
    }

    start = nextBoundary - delimiter.length; // will be advanced by delimiter.length at top
  }

  const fields = {};
  const files = [];
  for (const part of parts) {
    if (part.type === 'field') fields[part.name] = part.value;
    else files.push(part);
  }
  return { fields, files };
}

function bufferIndexOf(haystack, needle, fromIndex) {
  for (let i = fromIndex; i <= haystack.length - needle.length; i++) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}

module.exports = {
  MAX_IMAGE_BYTES,
  validateImageFile,
  generateUploadFilename,
  ensureUploadDir,
  parseMultipartBody,
  sanitizeFilename,
};
