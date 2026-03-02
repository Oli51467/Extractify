const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const ROOT_DIR = path.resolve(__dirname, '..');

const toNumber = (value, fallback, min = Number.NEGATIVE_INFINITY) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return parsed >= min ? parsed : fallback;
};

const parseOrigins = (rawOrigins) => {
  if (!rawOrigins) return ['http://localhost:5173', 'http://localhost:18982'];
  if (rawOrigins.trim() === '*') return ['*'];
  return rawOrigins
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
};

const resolvePathFromRoot = (targetPath, fallbackPath) => {
  const value = targetPath && targetPath.trim();
  if (!value) return fallbackPath;
  return path.isAbsolute(value) ? value : path.resolve(ROOT_DIR, value);
};

const maxFileSizeMB = toNumber(
  process.env.MAX_FILE_SIZE_MB || process.env.MAX_FILE_SIZE,
  50,
  1
);

const config = {
  rootDir: ROOT_DIR,
  server: {
    port: toNumber(process.env.PORT, 13434, 1),
    requestTimeoutMs: toNumber(process.env.REQUEST_TIMEOUT_MS, 5 * 60 * 1000, 1000)
  },
  security: {
    trustProxy: process.env.TRUST_PROXY === 'true',
    useHelmet: process.env.USE_HELMET !== 'false'
  },
  cors: {
    origins: parseOrigins(process.env.CORS_ORIGINS),
    exposedHeaders: ['Content-Disposition', 'Content-Type']
  },
  session: {
    cookieName: process.env.SESSION_COOKIE_NAME || 'extractify_sid',
    cookieMaxAgeMs: toNumber(process.env.SESSION_COOKIE_MAX_AGE_HOURS, 24 * 7, 1) * 60 * 60 * 1000,
    cookieSameSite: (process.env.SESSION_COOKIE_SAME_SITE || 'lax').toLowerCase(),
    cookieSecure: process.env.SESSION_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production'
  },
  upload: {
    maxFileSizeMB,
    maxFileSizeBytes: maxFileSizeMB * 1024 * 1024
  },
  jobs: {
    queueConcurrency: toNumber(process.env.JOB_QUEUE_CONCURRENCY, 2, 1),
    queueMaxSize: toNumber(process.env.JOB_QUEUE_MAX_SIZE, 100, 1),
    retentionMs: toNumber(process.env.JOB_RETENTION_HOURS, 72, 1) * 60 * 60 * 1000,
    cleanupIntervalMs: toNumber(process.env.JOB_CLEANUP_INTERVAL_HOURS, 6, 1) * 60 * 60 * 1000
  },
  tools: {
    sofficePath: process.env.SOFFICE_PATH || ''
  }
};

config.paths = {
  uploadRoot: resolvePathFromRoot(process.env.UPLOAD_ROOT, path.join(ROOT_DIR, 'uploads')),
  jobsRoot: resolvePathFromRoot(process.env.JOBS_ROOT, path.join(ROOT_DIR, 'uploads', 'jobs')),
  tempRoot: resolvePathFromRoot(process.env.TEMP_ROOT, path.join(ROOT_DIR, 'temp'))
};

const ensureRuntimeDirs = () => {
  [config.paths.uploadRoot, config.paths.jobsRoot, config.paths.tempRoot].forEach((dirPath) => {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });
};

module.exports = {
  ...config,
  ensureRuntimeDirs
};
