const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb, createId, nowIso } = require('./dbService');
const config = require('../config');
const { normalizeUploadedFilename } = require('../utils/filename');

const MAX_TOKEN_LENGTH = 120;

const normalizeToken = (value) => String(value || '')
  .trim()
  .replace(/[^a-zA-Z0-9_-]/g, '')
  .slice(0, MAX_TOKEN_LENGTH);

const normalizePathForCompare = (value) => path.resolve(value || '').replace(/\\/g, '/');

const isPathInsideRoot = (targetPath, rootPath) => {
  const target = normalizePathForCompare(targetPath);
  const root = normalizePathForCompare(rootPath);
  return target === root || target.startsWith(`${root}/`);
};

const generateToken = () => crypto.randomBytes(18).toString('base64url');

const mapShareRow = (row) => {
  if (!row) return null;
  const token = normalizeToken(row.token);
  return {
    id: row.id,
    token,
    projectId: row.project_id || '',
    runId: row.run_id || '',
    jobId: row.job_id || '',
    sourceName: normalizeUploadedFilename(row.source_name, 'Untitled'),
    imageCount: Number(row.image_count || 0),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    sharePath: `/share/${encodeURIComponent(token)}`,
    downloadPath: `/api/share/${encodeURIComponent(token)}/download`
  };
};

const resolveShareFileName = (share) => {
  const source = normalizeUploadedFilename(share?.sourceName || '', 'DocPix_Images');
  const safe = source.replace(/[\\/:*?"<>|]/g, '_').trim() || 'DocPix_Images';
  return `${safe}.zip`;
};

const buildPublicSharePayload = (share, origin = '') => {
  if (!share) return null;
  const normalizedOrigin = String(origin || '').replace(/\/+$/, '');
  const shareUrl = normalizedOrigin ? `${normalizedOrigin}${share.sharePath}` : share.sharePath;
  const downloadUrl = normalizedOrigin ? `${normalizedOrigin}${share.downloadPath}` : share.downloadPath;
  return {
    ...share,
    url: shareUrl,
    downloadUrl,
    fileName: resolveShareFileName(share)
  };
};

const createShareLink = (payload = {}) => {
  if (!config.share.enabled) return null;

  const rawZipPath = String(payload.zipAbsolutePath || '').trim();
  if (!rawZipPath) return null;

  const zipAbsolutePath = path.resolve(rawZipPath);
  if (!zipAbsolutePath || !fs.existsSync(zipAbsolutePath)) return null;
  if (!isPathInsideRoot(zipAbsolutePath, config.paths.uploadRoot)) {
    const error = new Error('分享文件路径非法');
    error.code = 'INVALID_SHARE_PATH';
    throw error;
  }

  const db = getDb();
  const id = createId('share');
  const createdAt = nowIso();
  const ttlMs = Math.max(60 * 1000, Number(payload.ttlMs || config.share.defaultTtlMs));
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const token = generateToken();
  const sourceName = normalizeUploadedFilename(payload.sourceName || '', 'Untitled');

  db.prepare(`
    INSERT INTO share_links (
      id, token, session_id, project_id, run_id, job_id, source_name,
      zip_path, image_count, created_at, expires_at, revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    id,
    token,
    String(payload.sessionId || ''),
    String(payload.projectId || ''),
    String(payload.runId || ''),
    String(payload.jobId || ''),
    sourceName,
    zipAbsolutePath,
    Math.max(0, Number(payload.imageCount || 0)),
    createdAt,
    expiresAt
  );

  return getShareByToken(token);
};

const getShareRowByToken = (token) => {
  const normalized = normalizeToken(token);
  if (!normalized) return null;
  const db = getDb();
  return db.prepare(`
    SELECT *
    FROM share_links
    WHERE token = ? AND revoked_at IS NULL
    LIMIT 1
  `).get(normalized);
};

const isExpired = (isoTime) => {
  const ts = Date.parse(String(isoTime || ''));
  if (!Number.isFinite(ts)) return true;
  return ts <= Date.now();
};

const getShareByToken = (token) => {
  const row = getShareRowByToken(token);
  if (!row) return null;
  if (isExpired(row.expires_at)) return null;
  return mapShareRow(row);
};

const getShareWithFileByToken = (token) => {
  const row = getShareRowByToken(token);
  if (!row) return null;
  if (isExpired(row.expires_at)) return null;

  const share = mapShareRow(row);
  const zipPath = path.resolve(String(row.zip_path || '').trim());
  if (!zipPath || !fs.existsSync(zipPath)) return null;
  if (!isPathInsideRoot(zipPath, config.paths.uploadRoot)) return null;

  return {
    ...share,
    zipPath
  };
};

module.exports = {
  createShareLink,
  getShareByToken,
  getShareWithFileByToken,
  buildPublicSharePayload,
  resolveShareFileName
};
