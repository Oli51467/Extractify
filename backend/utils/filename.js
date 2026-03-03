const CJK_PATTERN = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const MOJIBAKE_PATTERN = /[ÃÂâÐÑ]/;
const CONTROL_PATTERN = /[\u0000-\u001F\u007F]/g;

const hasCjk = (value) => CJK_PATTERN.test(value);

const hasMojibake = (value) => MOJIBAKE_PATTERN.test(value) || value.includes('�');

const decodeLatin1Utf8 = (value) => {
  try {
    return Buffer.from(value, 'latin1').toString('utf8');
  } catch (error) {
    return value;
  }
};

const shouldUseDecoded = (raw, decoded) => {
  if (!decoded || decoded === raw) return false;
  if (decoded.includes('�')) return false;

  const rawHasCjk = hasCjk(raw);
  const decodedHasCjk = hasCjk(decoded);
  if (decodedHasCjk && !rawHasCjk) return true;

  const rawHasMojibake = hasMojibake(raw);
  const decodedHasMojibake = hasMojibake(decoded);
  if (rawHasMojibake && !decodedHasMojibake) return true;

  return false;
};

const normalizeUploadedFilename = (name, fallback = 'unnamed') => {
  const raw = String(name || '').replace(CONTROL_PATTERN, '');
  if (!raw) {
    if (fallback === undefined || fallback === null) {
      return 'unnamed';
    }
    return String(fallback);
  }

  if (/^[\x00-\x7F]+$/.test(raw)) {
    return raw;
  }

  const decoded = decodeLatin1Utf8(raw).replace(CONTROL_PATTERN, '');
  const preferred = shouldUseDecoded(raw, decoded) ? decoded : raw;
  return preferred.normalize('NFC');
};

module.exports = {
  normalizeUploadedFilename
};
