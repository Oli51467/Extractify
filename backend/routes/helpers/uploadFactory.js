const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../../config');
const { normalizeUploadedFilename } = require('../../utils/filename');

const ensureUploadDir = (uploadDir) => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
};

const createStorage = (resolveDestination) => multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = resolveDestination(req, file);
    ensureUploadDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    file.originalname = normalizeUploadedFilename(file.originalname, 'document');
    const ext = path.extname(file.originalname || '').toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `file-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  file.originalname = normalizeUploadedFilename(file.originalname, 'document');
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/mspowerpoint',
    'application/powerpoint',
    'application/pdf',
    'text/markdown',
    'text/x-markdown',
    'text/plain'
  ];
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowedExts = ['.docx', '.doc', '.pptx', '.ppt', '.pdf', '.md', '.markdown'];

  if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
    return;
  }

  cb(new Error('不支持的文件类型，仅支持 Word、PowerPoint、Markdown 文档和 PDF 文件'), false);
};

const uploadOptions = {
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSizeBytes
  }
};

const createUploader = (resolveDestination) => multer({
  ...uploadOptions,
  storage: createStorage(resolveDestination)
});

module.exports = {
  createUploader
};
