const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const config = require('../config');
const { normalizeUploadedFilename } = require('../utils/filename');

const PREVIEW_ROOT = path.join(config.paths.tempRoot, 'document_previews');
const OFFICE_CONVERTIBLE_EXTENSIONS = new Set(['.doc', '.docx', '.ppt', '.pptx']);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);

const SOFFICE_CANDIDATES = [
  config.tools.sofficePath,
  process.env.SOFFICE_PATH,
  '/opt/homebrew/bin/soffice',
  '/usr/bin/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  'soffice'
].filter(Boolean);

const MIME_MAP = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8'
};

const normalizePathForCompare = (value = '') => path.resolve(value).replace(/\\/g, '/');

const isPathInsideRoot = (targetPath, rootPath) => {
  const target = normalizePathForCompare(targetPath);
  const root = normalizePathForCompare(rootPath);
  return target === root || target.startsWith(`${root}/`);
};

const asUserError = (message, code, statusCode = 400) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const resolveSofficeBinary = async () => {
  for (const candidate of SOFFICE_CANDIDATES) {
    if (!candidate) continue;
    const hasPathSeparator = candidate.includes('/') || candidate.includes('\\');
    if (hasPathSeparator && !fs.existsSync(candidate)) {
      continue;
    }
    try {
      await runCommand(candidate, ['--version'], 5000);
      return candidate;
    } catch (error) {
      // ignore and continue probing next candidate
    }
  }
  return '';
};

const runCommand = (binary, args, timeoutMs = 120000) => new Promise((resolve, reject) => {
  const child = spawn(binary, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  let timeout = null;

  if (timeoutMs > 0) {
    timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('命令执行超时'));
    }, timeoutMs);
  }

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (error) => {
    if (timeout) clearTimeout(timeout);
    reject(error);
  });

  child.on('close', (code) => {
    if (timeout) clearTimeout(timeout);
    if (code === 0) {
      resolve({ stdout, stderr });
      return;
    }
    reject(new Error(stderr || stdout || `命令执行失败（退出码 ${code}）`));
  });
});

const assertDocumentPathSafe = async (rawPath) => {
  const absolutePath = path.resolve(String(rawPath || '').trim());
  if (!absolutePath) {
    throw asUserError('文档存储路径无效', 'INVALID_DOCUMENT_PATH', 400);
  }

  if (!isPathInsideRoot(absolutePath, config.paths.uploadRoot)) {
    throw asUserError('文档路径越界', 'INVALID_DOCUMENT_PATH', 400);
  }

  const stats = await fs.promises.stat(absolutePath).catch(() => null);
  if (!stats || !stats.isFile()) {
    throw asUserError('文档文件不存在', 'DOCUMENT_FILE_NOT_FOUND', 404);
  }

  return {
    absolutePath,
    stats
  };
};

const resolveMimeType = (ext) => MIME_MAP[ext] || 'application/octet-stream';

const buildPreviewFileName = (document = {}, ext = '.pdf') => {
  const source = normalizeUploadedFilename(document.sourceName, document.originalFilename || 'document');
  const safe = source.replace(/[\\/:*?"<>|]/g, '_').trim() || 'document';
  return `${safe}${ext}`;
};

const buildPreviewCacheKey = (absolutePath, stats) => {
  const payload = `${absolutePath}|${stats.size}|${stats.mtimeMs}`;
  return crypto.createHash('sha1').update(payload).digest('hex');
};

const convertOfficeToPdf = async (absolutePath, stats) => {
  const sofficeBinary = await resolveSofficeBinary();
  if (!sofficeBinary) {
    throw asUserError(
      '当前环境缺少 LibreOffice（soffice），暂时无法在线预览 Office 文档',
      'PREVIEW_TOOL_MISSING',
      503
    );
  }

  const cacheKey = buildPreviewCacheKey(absolutePath, stats);
  const cacheDir = path.join(PREVIEW_ROOT, cacheKey);
  const cachedPdfPath = path.join(cacheDir, 'preview.pdf');

  if (fs.existsSync(cachedPdfPath)) {
    return cachedPdfPath;
  }

  await fs.promises.mkdir(cacheDir, { recursive: true });
  await runCommand(
    sofficeBinary,
    ['--headless', '--convert-to', 'pdf', '--outdir', cacheDir, absolutePath],
    120000
  );

  const expectedName = `${path.basename(absolutePath, path.extname(absolutePath))}.pdf`;
  const expectedPath = path.join(cacheDir, expectedName);
  if (fs.existsSync(expectedPath)) {
    if (expectedPath !== cachedPdfPath) {
      await fs.promises.rename(expectedPath, cachedPdfPath).catch(() => null);
    }
  }

  if (!fs.existsSync(cachedPdfPath)) {
    const generatedPdf = (await fs.promises.readdir(cacheDir))
      .find((name) => name.toLowerCase().endsWith('.pdf'));
    if (generatedPdf) {
      await fs.promises.rename(path.join(cacheDir, generatedPdf), cachedPdfPath).catch(() => null);
    }
  }

  if (!fs.existsSync(cachedPdfPath)) {
    throw asUserError('Office 文档预览转换失败', 'PREVIEW_CONVERT_FAILED', 500);
  }

  return cachedPdfPath;
};

const resolveDocumentPreview = async (document = {}) => {
  const { absolutePath, stats } = await assertDocumentPathSafe(document.storagePath);
  const ext = path.extname(absolutePath).toLowerCase();

  if (ext === '.pdf') {
    return {
      filePath: absolutePath,
      mimeType: resolveMimeType(ext),
      fileName: buildPreviewFileName(document, '.pdf')
    };
  }

  if (MARKDOWN_EXTENSIONS.has(ext)) {
    return {
      filePath: absolutePath,
      mimeType: resolveMimeType(ext),
      fileName: buildPreviewFileName(document, ext)
    };
  }

  if (!OFFICE_CONVERTIBLE_EXTENSIONS.has(ext)) {
    throw asUserError('当前文档类型暂不支持在线预览', 'PREVIEW_UNSUPPORTED_TYPE', 400);
  }

  const previewPdfPath = await convertOfficeToPdf(absolutePath, stats);
  return {
    filePath: previewPdfPath,
    mimeType: 'application/pdf',
    fileName: buildPreviewFileName(document, '.pdf')
  };
};

module.exports = {
  resolveDocumentPreview,
  resolveMimeType
};
