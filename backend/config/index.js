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

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseOrigins = (rawOrigins) => {
  if (!rawOrigins) return ['http://localhost:*', 'http://127.0.0.1:*'];
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

const normalizeBaseUrl = (value, fallback) => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized.replace(/\/+$/, '');
};

const maxFileSizeMB = toNumber(
  process.env.MAX_FILE_SIZE_MB || process.env.MAX_FILE_SIZE,
  50,
  1
);

const serverPort = toNumber(process.env.PORT, 13434, 1);
const googleClientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const googleClientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
const githubClientId = String(process.env.GITHUB_CLIENT_ID || '').trim();
const githubClientSecret = String(process.env.GITHUB_CLIENT_SECRET || '').trim();
const googleOAuthEnabled = Boolean(googleClientId && googleClientSecret);
const githubOAuthEnabled = Boolean(githubClientId && githubClientSecret);
const authEnabledFallback = googleOAuthEnabled || githubOAuthEnabled;

const config = {
  rootDir: ROOT_DIR,
  server: {
    port: serverPort,
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
  auth: {
    enabled: toBoolean(process.env.AUTH_ENABLED, authEnabledFallback),
    frontendBaseUrl: normalizeBaseUrl(process.env.AUTH_FRONTEND_BASE_URL, 'http://localhost:5173'),
    backendBaseUrl: normalizeBaseUrl(process.env.AUTH_BACKEND_BASE_URL, `http://localhost:${serverPort}`),
    oauthStateTtlMs: toNumber(process.env.OAUTH_STATE_TTL_SECONDS, 600, 60) * 1000,
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      enabled: googleOAuthEnabled
    },
    github: {
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      enabled: githubOAuthEnabled
    }
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
    sofficePath: process.env.SOFFICE_PATH || '',
    tesseractPath: process.env.TESSERACT_PATH || ''
  },
  processing: {
    imageDedupeEnabled: process.env.IMAGE_DEDUPE_ENABLED !== 'false',
    imageDedupeHammingThreshold: toNumber(process.env.IMAGE_DEDUPE_HAMMING_THRESHOLD, 6, 0),
    imageDedupeAspectTolerance: toNumber(process.env.IMAGE_DEDUPE_ASPECT_TOLERANCE, 0.03, 0),
    autoOcrEnabled: process.env.AUTO_OCR_ENABLED !== 'false',
    autoNamingEnabled: process.env.AUTO_NAMING_ENABLED !== 'false'
  },
  share: {
    enabled: process.env.SHARE_LINK_ENABLED !== 'false',
    defaultTtlMs: toNumber(process.env.SHARE_LINK_TTL_HOURS, 168, 1) * 60 * 60 * 1000
  },
  database: {
    file: resolvePathFromRoot(process.env.DB_FILE, path.join(ROOT_DIR, 'data', 'extractify.sqlite'))
  }
};

if (config.auth.enabled && !config.auth.google.enabled && !config.auth.github.enabled) {
  config.auth.enabled = false;
}

config.paths = {
  uploadRoot: resolvePathFromRoot(process.env.UPLOAD_ROOT, path.join(ROOT_DIR, 'uploads')),
  jobsRoot: resolvePathFromRoot(process.env.JOBS_ROOT, path.join(ROOT_DIR, 'uploads', 'jobs')),
  tempRoot: resolvePathFromRoot(process.env.TEMP_ROOT, path.join(ROOT_DIR, 'temp')),
  dataRoot: resolvePathFromRoot(process.env.DATA_ROOT, path.join(ROOT_DIR, 'data'))
};

const ensureRuntimeDirs = () => {
  [
    config.paths.uploadRoot,
    config.paths.jobsRoot,
    config.paths.tempRoot,
    config.paths.dataRoot,
    path.dirname(config.database.file)
  ].forEach((dirPath) => {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });
};

module.exports = {
  ...config,
  ensureRuntimeDirs
};
