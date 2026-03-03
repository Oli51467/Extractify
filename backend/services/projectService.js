const { getDb, createId, nowIso, parseJson, toJson } = require('./dbService');
const { normalizeUploadedFilename } = require('../utils/filename');

const PROJECT_NAME_MAX = 80;
const PROJECT_DESC_MAX = 300;
const DEFAULT_PROJECT_NAME = '未命名项目';
const WORKSPACE_TYPE_EXTRACT = 'extract';
const WORKSPACE_TYPE_MERGE = 'merge';

const sanitizeText = (value, maxLen, fallback = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLen);
};

const normalizeWorkspaceType = (value, fallback = WORKSPACE_TYPE_EXTRACT) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === WORKSPACE_TYPE_MERGE) return WORKSPACE_TYPE_MERGE;
  if (normalized === WORKSPACE_TYPE_EXTRACT) return WORKSPACE_TYPE_EXTRACT;
  return fallback;
};

const resolveWorkspaceFilter = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'all' || normalized === '*') return '';
  return normalizeWorkspaceType(normalized, WORKSPACE_TYPE_EXTRACT);
};

const mapProjectRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workspaceType: normalizeWorkspaceType(row.workspace_type, WORKSPACE_TYPE_EXTRACT),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    documentCount: Number(row.document_count || 0),
    assetCount: Number(row.asset_count || 0),
    activeBatchCount: Number(row.active_batch_count || 0),
    latestRunAt: row.latest_run_at || '',
    latestBatchAt: row.latest_batch_at || ''
  };
};

const mapDocumentRow = (row) => {
  if (!row) return null;
  const sourceName = normalizeUploadedFilename(row.source_name, '未命名文档');
  const originalFilename = normalizeUploadedFilename(row.original_filename, sourceName);
  return {
    id: row.id,
    projectId: row.project_id,
    jobId: row.job_id,
    sourceName,
    originalFilename,
    fileType: row.file_type,
    fileSize: Number(row.file_size || 0),
    storagePath: row.storage_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapRunRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    jobId: row.job_id,
    batchId: row.batch_id,
    documentId: row.document_id,
    sourceName: normalizeUploadedFilename(row.source_name, ''),
    status: row.status,
    progress: Number(row.progress || 0),
    message: row.message || '',
    error: row.error || '',
    params: parseJson(row.params_json, {}),
    result: parseJson(row.result_json, {}),
    startedAt: row.started_at || '',
    finishedAt: row.finished_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapAssetRow = (row) => {
  if (!row) return null;
  const source = parseJson(row.source_context_json, {});
  const sourceName = normalizeUploadedFilename(source.sourceName, '');
  return {
    id: row.id,
    projectId: row.project_id,
    runId: row.run_id,
    jobId: row.job_id,
    documentId: row.document_id,
    name: row.name,
    path: row.path,
    size: Number(row.size || 0),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    page: row.page == null ? null : Number(row.page),
    deduped: Number(row.deduped || 0) === 1,
    isPrimary: Number(row.is_primary || 0) === 1,
    sourceContext: {
      ...source,
      sourceName
    },
    createdAt: row.created_at
  };
};

const mapBatchJobRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    status: row.status,
    totalItems: Number(row.total_items || 0),
    queuedItems: Number(row.queued_items || 0),
    processingItems: Number(row.processing_items || 0),
    completedItems: Number(row.completed_items || 0),
    failedItems: Number(row.failed_items || 0),
    cancelledItems: Number(row.cancelled_items || 0),
    params: parseJson(row.params_json, {}),
    error: row.error || '',
    startedAt: row.started_at || '',
    finishedAt: row.finished_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapBatchItemRow = (row) => {
  if (!row) return null;
  const sourceName = normalizeUploadedFilename(row.source_name, '');
  const originalFilename = normalizeUploadedFilename(row.original_filename, sourceName);
  return {
    id: row.id,
    batchId: row.batch_id,
    projectId: row.project_id,
    runId: row.run_id || '',
    jobId: row.job_id || '',
    documentId: row.document_id || '',
    sourceName,
    originalFilename,
    fileType: row.file_type || '',
    status: row.status,
    progress: Number(row.progress || 0),
    message: row.message || '',
    error: row.error || '',
    params: parseJson(row.params_json, {}),
    result: parseJson(row.result_json, {}),
    startedAt: row.started_at || '',
    finishedAt: row.finished_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const touchProject = (projectId) => {
  const db = getDb();
  db.prepare(`
    UPDATE projects
    SET updated_at = ?
    WHERE id = ?
  `).run(nowIso(), projectId);
};

const createAuditEvent = (sessionId, projectId, entityType, entityId, action, detail = {}) => {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_events (
      session_id, project_id, entity_type, entity_id, action, detail_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(sessionId || ''),
    String(projectId || ''),
    String(entityType || ''),
    String(entityId || ''),
    String(action || ''),
    toJson(detail),
    nowIso()
  );
};

const getProjectOwnedBySession = (sessionId, projectId) => {
  if (!sessionId || !projectId) return null;
  const db = getDb();
  const row = db.prepare(`
    SELECT *
    FROM projects
    WHERE id = ? AND session_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(projectId, sessionId);
  return row || null;
};

const assertProjectOwnedBySession = (sessionId, projectId) => {
  const project = getProjectOwnedBySession(sessionId, projectId);
  if (!project) {
    const error = new Error('项目不存在或无权限访问');
    error.code = 'PROJECT_NOT_FOUND';
    throw error;
  }
  return project;
};

const createProject = (sessionId, payload = {}) => {
  const db = getDb();
  const id = createId('proj');
  const now = nowIso();
  const name = sanitizeText(payload.name, PROJECT_NAME_MAX, DEFAULT_PROJECT_NAME);
  const description = sanitizeText(payload.description, PROJECT_DESC_MAX, '');
  const workspaceType = normalizeWorkspaceType(payload.workspaceType, WORKSPACE_TYPE_EXTRACT);

  db.prepare(`
    INSERT INTO projects (
      id, session_id, name, description, workspace_type, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(id, sessionId, name, description, workspaceType, now, now);

  createAuditEvent(sessionId, id, 'project', id, 'project.created', { name, workspaceType });
  return getProject(sessionId, id);
};

const updateProject = (sessionId, projectId, patch = {}) => {
  const current = assertProjectOwnedBySession(sessionId, projectId);
  const db = getDb();
  const name = sanitizeText(patch.name, PROJECT_NAME_MAX, DEFAULT_PROJECT_NAME);
  const description = sanitizeText(patch.description, PROJECT_DESC_MAX, '');
  const workspaceType = Object.prototype.hasOwnProperty.call(patch, 'workspaceType')
    ? normalizeWorkspaceType(patch.workspaceType, normalizeWorkspaceType(current.workspace_type, WORKSPACE_TYPE_EXTRACT))
    : normalizeWorkspaceType(current.workspace_type, WORKSPACE_TYPE_EXTRACT);
  const now = nowIso();

  db.prepare(`
    UPDATE projects
    SET name = ?, description = ?, workspace_type = ?, updated_at = ?
    WHERE id = ? AND session_id = ? AND deleted_at IS NULL
  `).run(name, description, workspaceType, now, projectId, sessionId);

  createAuditEvent(sessionId, projectId, 'project', projectId, 'project.updated', { name, workspaceType });
  return getProject(sessionId, projectId);
};

const deleteProject = (sessionId, projectId) => {
  assertProjectOwnedBySession(sessionId, projectId);
  const db = getDb();
  const now = nowIso();

  db.prepare(`
    UPDATE projects
    SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND session_id = ? AND deleted_at IS NULL
  `).run(now, now, projectId, sessionId);

  createAuditEvent(sessionId, projectId, 'project', projectId, 'project.deleted', {});
  return true;
};

const listProjects = (sessionId, options = {}) => {
  const db = getDb();
  const workspaceFilter = resolveWorkspaceFilter(options.workspaceType);
  const rows = workspaceFilter
    ? db.prepare(`
    SELECT
      p.*,
      (
        SELECT COUNT(*)
        FROM documents d
        WHERE d.project_id = p.id AND d.deleted_at IS NULL
      ) AS document_count,
      (
        SELECT COUNT(*)
        FROM assets a
        WHERE a.project_id = p.id
      ) AS asset_count,
      (
        SELECT COUNT(*)
        FROM batch_jobs b
        WHERE b.project_id = p.id AND b.status IN ('queued', 'processing')
      ) AS active_batch_count,
      (
        SELECT MAX(r.created_at)
        FROM runs r
        WHERE r.project_id = p.id
      ) AS latest_run_at,
      (
        SELECT MAX(b.updated_at)
        FROM batch_jobs b
        WHERE b.project_id = p.id
      ) AS latest_batch_at
    FROM projects p
    WHERE p.session_id = ? AND p.deleted_at IS NULL
      AND p.workspace_type = ?
    ORDER BY p.updated_at DESC
  `).all(sessionId, workspaceFilter)
    : db.prepare(`
    SELECT
      p.*,
      (
        SELECT COUNT(*)
        FROM documents d
        WHERE d.project_id = p.id AND d.deleted_at IS NULL
      ) AS document_count,
      (
        SELECT COUNT(*)
        FROM assets a
        WHERE a.project_id = p.id
      ) AS asset_count,
      (
        SELECT COUNT(*)
        FROM batch_jobs b
        WHERE b.project_id = p.id AND b.status IN ('queued', 'processing')
      ) AS active_batch_count,
      (
        SELECT MAX(r.created_at)
        FROM runs r
        WHERE r.project_id = p.id
      ) AS latest_run_at,
      (
        SELECT MAX(b.updated_at)
        FROM batch_jobs b
        WHERE b.project_id = p.id
      ) AS latest_batch_at
    FROM projects p
    WHERE p.session_id = ? AND p.deleted_at IS NULL
    ORDER BY p.updated_at DESC
  `).all(sessionId);

  return rows.map(mapProjectRow);
};

const getProject = (sessionId, projectId) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      p.*,
      (
        SELECT COUNT(*)
        FROM documents d
        WHERE d.project_id = p.id AND d.deleted_at IS NULL
      ) AS document_count,
      (
        SELECT COUNT(*)
        FROM assets a
        WHERE a.project_id = p.id
      ) AS asset_count,
      (
        SELECT COUNT(*)
        FROM batch_jobs b
        WHERE b.project_id = p.id AND b.status IN ('queued', 'processing')
      ) AS active_batch_count,
      (
        SELECT MAX(r.created_at)
        FROM runs r
        WHERE r.project_id = p.id
      ) AS latest_run_at,
      (
        SELECT MAX(b.updated_at)
        FROM batch_jobs b
        WHERE b.project_id = p.id
      ) AS latest_batch_at
    FROM projects p
    WHERE p.id = ? AND p.session_id = ? AND p.deleted_at IS NULL
    LIMIT 1
  `).get(projectId, sessionId);

  return mapProjectRow(row);
};

const createDocument = (sessionId, projectId, payload = {}) => {
  assertProjectOwnedBySession(sessionId, projectId);
  const db = getDb();
  const id = createId('doc');
  const now = nowIso();
  const sourceName = sanitizeText(
    normalizeUploadedFilename(payload.sourceName, '未命名文档'),
    200,
    '未命名文档'
  );
  const originalFilename = sanitizeText(
    normalizeUploadedFilename(payload.originalFilename, sourceName),
    255,
    sourceName
  );
  const fileType = sanitizeText(payload.fileType, 32, '');
  const fileSize = Number(payload.fileSize || 0);
  const storagePath = sanitizeText(payload.storagePath, 600, '');
  const jobId = sanitizeText(payload.jobId, 120, '');

  db.prepare(`
    INSERT INTO documents (
      id, project_id, session_id, job_id, source_name, original_filename, file_type, file_size, storage_path, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    id,
    projectId,
    sessionId,
    jobId,
    sourceName,
    originalFilename,
    fileType,
    Number.isFinite(fileSize) ? fileSize : 0,
    storagePath,
    now,
    now
  );

  touchProject(projectId);
  createAuditEvent(sessionId, projectId, 'document', id, 'document.created', {
    sourceName,
    fileType
  });

  return getDocumentById(sessionId, projectId, id);
};

const getDocumentById = (sessionId, projectId, documentId) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT *
    FROM documents
    WHERE id = ? AND project_id = ? AND session_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(documentId, projectId, sessionId);

  return mapDocumentRow(row);
};

const listDocuments = (sessionId, projectId, options = {}) => {
  assertProjectOwnedBySession(sessionId, projectId);
  const db = getDb();
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 300));
  const offset = Math.max(0, Number(options.offset || 0));

  const rows = db.prepare(`
    SELECT *
    FROM documents
    WHERE project_id = ? AND session_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(projectId, sessionId, limit, offset);

  return rows.map(mapDocumentRow);
};

const createRun = (sessionId, projectId, payload = {}) => {
  assertProjectOwnedBySession(sessionId, projectId);
  const db = getDb();
  const id = createId('run');
  const now = nowIso();
  const status = sanitizeText(payload.status, 40, 'queued');
  const sourceName = sanitizeText(normalizeUploadedFilename(payload.sourceName, ''), 200, '');
  const jobId = sanitizeText(payload.jobId, 120, '');
  const batchId = sanitizeText(payload.batchId, 120, '');
  const documentId = sanitizeText(payload.documentId, 120, '');
  const message = sanitizeText(payload.message, 500, '');
  const progress = Number(payload.progress || 0);
  const params = payload.params || {};

  db.prepare(`
    INSERT INTO runs (
      id, project_id, session_id, job_id, batch_id, document_id, source_name,
      status, progress, message, error, params_json, result_json,
      started_at, finished_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, '{}', ?, NULL, ?, ?)
  `).run(
    id,
    projectId,
    sessionId,
    jobId,
    batchId,
    documentId || null,
    sourceName,
    status,
    Number.isFinite(progress) ? progress : 0,
    message,
    toJson(params),
    payload.startedAt || now,
    now,
    now
  );

  touchProject(projectId);
  createAuditEvent(sessionId, projectId, 'run', id, 'run.created', {
    status,
    sourceName,
    jobId
  });

  return getRunById(sessionId, projectId, id);
};

const getRunById = (sessionId, projectId, runId) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT *
    FROM runs
    WHERE id = ? AND project_id = ? AND session_id = ?
    LIMIT 1
  `).get(runId, projectId, sessionId);
  return mapRunRow(row);
};

const getRunByJob = (sessionId, projectId, jobId) => {
  if (!jobId) return null;
  const db = getDb();
  const row = db.prepare(`
    SELECT *
    FROM runs
    WHERE job_id = ? AND project_id = ? AND session_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(jobId, projectId, sessionId);
  return mapRunRow(row);
};

const updateRun = (sessionId, projectId, runId, patch = {}) => {
  const current = getRunById(sessionId, projectId, runId);
  if (!current) {
    const error = new Error('处理记录不存在');
    error.code = 'RUN_NOT_FOUND';
    throw error;
  }

  const db = getDb();
  const now = nowIso();
  const status = sanitizeText(patch.status, 40, current.status);
  const progress = Number.isFinite(Number(patch.progress)) ? Number(patch.progress) : current.progress;
  const message = Object.prototype.hasOwnProperty.call(patch, 'message')
    ? sanitizeText(patch.message, 500, '')
    : current.message;
  const errorText = Object.prototype.hasOwnProperty.call(patch, 'error')
    ? sanitizeText(patch.error, 1200, '')
    : current.error;
  const params = Object.prototype.hasOwnProperty.call(patch, 'params') ? (patch.params || {}) : current.params;
  const result = Object.prototype.hasOwnProperty.call(patch, 'result') ? (patch.result || {}) : current.result;
  const startedAt = patch.startedAt || current.startedAt || now;
  const finishedAt = Object.prototype.hasOwnProperty.call(patch, 'finishedAt')
    ? (patch.finishedAt || null)
    : ((status === 'completed' || status === 'failed' || status === 'cancelled') ? now : current.finishedAt || null);

  db.prepare(`
    UPDATE runs
    SET status = ?, progress = ?, message = ?, error = ?, params_json = ?, result_json = ?,
        started_at = ?, finished_at = ?, updated_at = ?
    WHERE id = ? AND project_id = ? AND session_id = ?
  `).run(
    status,
    Math.max(0, Math.min(100, Math.round(progress))),
    message,
    errorText,
    toJson(params),
    toJson(result),
    startedAt || null,
    finishedAt,
    now,
    runId,
    projectId,
    sessionId
  );

  touchProject(projectId);
  return getRunById(sessionId, projectId, runId);
};

const listRuns = (sessionId, projectId, options = {}) => {
  assertProjectOwnedBySession(sessionId, projectId);
  const db = getDb();
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 300));
  const offset = Math.max(0, Number(options.offset || 0));

  const rows = db.prepare(`
    SELECT *
    FROM runs
    WHERE project_id = ? AND session_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(projectId, sessionId, limit, offset);

  return rows.map(mapRunRow);
};

const replaceRunAssets = (sessionId, projectId, runId, payload = {}) => {
  const run = getRunById(sessionId, projectId, runId);
  if (!run) {
    const error = new Error('处理记录不存在');
    error.code = 'RUN_NOT_FOUND';
    throw error;
  }

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`
      DELETE FROM assets
      WHERE run_id = ? AND project_id = ? AND session_id = ?
    `).run(runId, projectId, sessionId);

    const insertStmt = db.prepare(`
      INSERT INTO assets (
        id, project_id, session_id, run_id, job_id, document_id, name, path, size, width, height, page,
        deduped, is_primary, source_context_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = nowIso();
    const images = Array.isArray(payload.images) ? payload.images : [];
    images.forEach((image) => {
      insertStmt.run(
        createId('asset'),
        projectId,
        sessionId,
        runId,
        sanitizeText(payload.jobId || run.jobId, 120, ''),
        sanitizeText(payload.documentId || run.documentId, 120, ''),
        sanitizeText(image.name, 255, 'image'),
        sanitizeText(image.path, 600, ''),
        Number(image.size) || 0,
        image.width == null ? null : Number(image.width),
        image.height == null ? null : Number(image.height),
        image.page == null ? null : Number(image.page),
        Number(image.deduped ? 1 : 0),
        Number(image.isPrimary === false ? 0 : 1),
        toJson({
          sourceName: normalizeUploadedFilename(payload.sourceName || run.sourceName || '', ''),
          page: image.page == null ? null : Number(image.page),
          runId,
          documentId: payload.documentId || run.documentId || ''
        }),
        now
      );
    });
  });
  tx();

  touchProject(projectId);
  return listAssetsByRun(sessionId, projectId, runId);
};

const listAssets = (sessionId, projectId, options = {}) => {
  assertProjectOwnedBySession(sessionId, projectId);
  const db = getDb();
  const limit = Math.max(1, Math.min(Number(options.limit || 200), 500));
  const offset = Math.max(0, Number(options.offset || 0));
  const keyword = String(options.keyword || '').trim().toLowerCase();

  const rows = keyword
    ? db.prepare(`
      SELECT a.*
      FROM assets a
      WHERE a.project_id = ? AND a.session_id = ?
        AND (
          LOWER(a.name) LIKE ?
          OR LOWER(a.path) LIKE ?
        )
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(projectId, sessionId, `%${keyword}%`, `%${keyword}%`, limit, offset)
    : db.prepare(`
      SELECT a.*
      FROM assets a
      WHERE a.project_id = ? AND a.session_id = ?
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(projectId, sessionId, limit, offset);

  return rows.map(mapAssetRow);
};

const listAssetsByRun = (sessionId, projectId, runId) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT *
    FROM assets
    WHERE run_id = ? AND project_id = ? AND session_id = ?
    ORDER BY created_at DESC
  `).all(runId, projectId, sessionId);
  return rows.map(mapAssetRow);
};

const createBatchJob = (sessionId, projectId, payload = {}) => {
  assertProjectOwnedBySession(sessionId, projectId);
  const db = getDb();
  const id = createId('batch');
  const now = nowIso();
  const name = sanitizeText(payload.name, 120, `批处理 ${new Date().toLocaleString()}`);
  const totalItems = Math.max(0, Number(payload.totalItems || 0));
  const status = sanitizeText(payload.status, 40, 'queued');

  db.prepare(`
    INSERT INTO batch_jobs (
      id, project_id, session_id, name, status, total_items, queued_items, processing_items,
      completed_items, failed_items, cancelled_items, params_json, error, started_at, finished_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, '', ?, NULL, ?, ?)
  `).run(
    id,
    projectId,
    sessionId,
    name,
    status,
    totalItems,
    totalItems,
    toJson(payload.params || {}),
    payload.startedAt || now,
    now,
    now
  );

  createAuditEvent(sessionId, projectId, 'batch', id, 'batch.created', {
    name,
    totalItems
  });
  touchProject(projectId);
  return getBatchJob(sessionId, projectId, id);
};

const getBatchJob = (sessionId, projectId, batchId) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT *
    FROM batch_jobs
    WHERE id = ? AND project_id = ? AND session_id = ?
    LIMIT 1
  `).get(batchId, projectId, sessionId);
  return mapBatchJobRow(row);
};

const listBatchJobs = (sessionId, projectId, options = {}) => {
  assertProjectOwnedBySession(sessionId, projectId);
  const db = getDb();
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 300));
  const offset = Math.max(0, Number(options.offset || 0));

  const rows = db.prepare(`
    SELECT *
    FROM batch_jobs
    WHERE project_id = ? AND session_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(projectId, sessionId, limit, offset);

  return rows.map(mapBatchJobRow);
};

const updateBatchJob = (sessionId, projectId, batchId, patch = {}) => {
  const current = getBatchJob(sessionId, projectId, batchId);
  if (!current) {
    const error = new Error('批量任务不存在');
    error.code = 'BATCH_NOT_FOUND';
    throw error;
  }

  const db = getDb();
  const now = nowIso();
  const status = sanitizeText(patch.status, 40, current.status);
  const next = {
    totalItems: Number.isFinite(Number(patch.totalItems)) ? Number(patch.totalItems) : current.totalItems,
    queuedItems: Number.isFinite(Number(patch.queuedItems)) ? Number(patch.queuedItems) : current.queuedItems,
    processingItems: Number.isFinite(Number(patch.processingItems)) ? Number(patch.processingItems) : current.processingItems,
    completedItems: Number.isFinite(Number(patch.completedItems)) ? Number(patch.completedItems) : current.completedItems,
    failedItems: Number.isFinite(Number(patch.failedItems)) ? Number(patch.failedItems) : current.failedItems,
    cancelledItems: Number.isFinite(Number(patch.cancelledItems)) ? Number(patch.cancelledItems) : current.cancelledItems
  };

  const params = Object.prototype.hasOwnProperty.call(patch, 'params') ? (patch.params || {}) : current.params;
  const errorText = Object.prototype.hasOwnProperty.call(patch, 'error')
    ? sanitizeText(patch.error, 1200, '')
    : current.error;
  const startedAt = patch.startedAt || current.startedAt || now;
  const finishedAt = Object.prototype.hasOwnProperty.call(patch, 'finishedAt')
    ? (patch.finishedAt || null)
    : ((status === 'completed' || status === 'failed' || status === 'cancelled') ? now : current.finishedAt || null);

  db.prepare(`
    UPDATE batch_jobs
    SET status = ?, total_items = ?, queued_items = ?, processing_items = ?, completed_items = ?,
        failed_items = ?, cancelled_items = ?, params_json = ?, error = ?, started_at = ?, finished_at = ?, updated_at = ?
    WHERE id = ? AND project_id = ? AND session_id = ?
  `).run(
    status,
    next.totalItems,
    next.queuedItems,
    next.processingItems,
    next.completedItems,
    next.failedItems,
    next.cancelledItems,
    toJson(params),
    errorText,
    startedAt || null,
    finishedAt,
    now,
    batchId,
    projectId,
    sessionId
  );

  touchProject(projectId);
  return getBatchJob(sessionId, projectId, batchId);
};

const createBatchItems = (sessionId, projectId, batchId, items = []) => {
  const batch = getBatchJob(sessionId, projectId, batchId);
  if (!batch) {
    const error = new Error('批量任务不存在');
    error.code = 'BATCH_NOT_FOUND';
    throw error;
  }

  const db = getDb();
  const insertStmt = db.prepare(`
    INSERT INTO batch_items (
      id, batch_id, project_id, session_id, run_id, job_id, document_id, source_name, original_filename,
      file_type, status, progress, message, error, params_json, result_json, started_at, finished_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, '', ?, '', ?, ?, ?, ?, ?, ?, '', ?, '{}', NULL, NULL, ?, ?)
  `);
  const now = nowIso();

  const tx = db.transaction(() => {
    items.forEach((item) => {
      const sourceName = normalizeUploadedFilename(item.sourceName, '');
      const originalFilename = normalizeUploadedFilename(item.originalFilename || sourceName, sourceName);
      insertStmt.run(
        createId('batchitem'),
        batchId,
        projectId,
        sessionId,
        sanitizeText(item.jobId, 120, ''),
        sanitizeText(sourceName, 255, ''),
        sanitizeText(originalFilename, 255, ''),
        sanitizeText(item.fileType, 40, ''),
        sanitizeText(item.status, 40, 'queued'),
        Number.isFinite(Number(item.progress)) ? Number(item.progress) : 0,
        sanitizeText(item.message, 500, '等待处理'),
        toJson(item.params || {}),
        now,
        now
      );
    });
  });
  tx();

  return listBatchItems(sessionId, projectId, batchId);
};

const getBatchItem = (sessionId, projectId, itemId) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT *
    FROM batch_items
    WHERE id = ? AND project_id = ? AND session_id = ?
    LIMIT 1
  `).get(itemId, projectId, sessionId);
  return mapBatchItemRow(row);
};

const findBatchItemByJobId = (sessionId, projectId, batchId, jobId) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT *
    FROM batch_items
    WHERE job_id = ? AND batch_id = ? AND project_id = ? AND session_id = ?
    LIMIT 1
  `).get(jobId, batchId, projectId, sessionId);
  return mapBatchItemRow(row);
};

const updateBatchItem = (sessionId, projectId, itemId, patch = {}) => {
  const current = getBatchItem(sessionId, projectId, itemId);
  if (!current) {
    const error = new Error('批量子任务不存在');
    error.code = 'BATCH_ITEM_NOT_FOUND';
    throw error;
  }

  const db = getDb();
  const now = nowIso();
  const status = sanitizeText(patch.status, 40, current.status);
  const progress = Number.isFinite(Number(patch.progress)) ? Number(patch.progress) : current.progress;
  const message = Object.prototype.hasOwnProperty.call(patch, 'message')
    ? sanitizeText(patch.message, 500, '')
    : current.message;
  const errorText = Object.prototype.hasOwnProperty.call(patch, 'error')
    ? sanitizeText(patch.error, 1200, '')
    : current.error;
  const params = Object.prototype.hasOwnProperty.call(patch, 'params') ? (patch.params || {}) : current.params;
  const result = Object.prototype.hasOwnProperty.call(patch, 'result') ? (patch.result || {}) : current.result;
  const runId = Object.prototype.hasOwnProperty.call(patch, 'runId')
    ? sanitizeText(patch.runId, 120, '')
    : current.runId;
  const documentId = Object.prototype.hasOwnProperty.call(patch, 'documentId')
    ? sanitizeText(patch.documentId, 120, '')
    : current.documentId;
  const startedAt = patch.startedAt || current.startedAt || now;
  const finishedAt = Object.prototype.hasOwnProperty.call(patch, 'finishedAt')
    ? (patch.finishedAt || null)
    : ((status === 'completed' || status === 'failed' || status === 'cancelled') ? now : current.finishedAt || null);

  db.prepare(`
    UPDATE batch_items
    SET run_id = ?, document_id = ?, status = ?, progress = ?, message = ?, error = ?,
        params_json = ?, result_json = ?, started_at = ?, finished_at = ?, updated_at = ?
    WHERE id = ? AND project_id = ? AND session_id = ?
  `).run(
    runId,
    documentId || null,
    status,
    Math.max(0, Math.min(100, Math.round(progress))),
    message,
    errorText,
    toJson(params),
    toJson(result),
    startedAt || null,
    finishedAt,
    now,
    itemId,
    projectId,
    sessionId
  );

  return getBatchItem(sessionId, projectId, itemId);
};

const listBatchItems = (sessionId, projectId, batchId, options = {}) => {
  const batch = getBatchJob(sessionId, projectId, batchId);
  if (!batch) {
    const error = new Error('批量任务不存在');
    error.code = 'BATCH_NOT_FOUND';
    throw error;
  }

  const db = getDb();
  const limit = Math.max(1, Math.min(Number(options.limit || 300), 1000));
  const offset = Math.max(0, Number(options.offset || 0));
  const rows = db.prepare(`
    SELECT *
    FROM batch_items
    WHERE batch_id = ? AND project_id = ? AND session_id = ?
    ORDER BY created_at ASC
    LIMIT ? OFFSET ?
  `).all(batchId, projectId, sessionId, limit, offset);

  return rows.map(mapBatchItemRow);
};

const recomputeBatchJobCounters = (sessionId, projectId, batchId) => {
  const batch = getBatchJob(sessionId, projectId, batchId);
  if (!batch) return null;
  const db = getDb();

  const counters = db.prepare(`
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count
    FROM batch_items
    WHERE batch_id = ? AND project_id = ? AND session_id = ?
  `).get(batchId, projectId, sessionId);

  const total = Number(counters.total_count || 0);
  const queued = Number(counters.queued_count || 0);
  const processing = Number(counters.processing_count || 0);
  const completed = Number(counters.completed_count || 0);
  const failed = Number(counters.failed_count || 0);
  const cancelled = Number(counters.cancelled_count || 0);

  let status = 'queued';
  if (processing > 0) {
    status = 'processing';
  } else if (queued > 0) {
    status = completed > 0 || failed > 0 ? 'processing' : 'queued';
  } else if (failed > 0 && completed === 0) {
    status = 'failed';
  } else if (cancelled === total && total > 0) {
    status = 'cancelled';
  } else if (total > 0 && completed + failed + cancelled === total) {
    status = failed > 0 ? 'completed_with_errors' : 'completed';
  }

  return updateBatchJob(sessionId, projectId, batchId, {
    status,
    totalItems: total,
    queuedItems: queued,
    processingItems: processing,
    completedItems: completed,
    failedItems: failed,
    cancelledItems: cancelled,
    finishedAt: (queued === 0 && processing === 0) ? nowIso() : null
  });
};

const listAuditEvents = (sessionId, projectId, options = {}) => {
  if (projectId) {
    assertProjectOwnedBySession(sessionId, projectId);
  }
  const db = getDb();
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 300));
  const offset = Math.max(0, Number(options.offset || 0));

  const rows = projectId
    ? db.prepare(`
      SELECT *
      FROM audit_events
      WHERE session_id = ? AND project_id = ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(sessionId, projectId, limit, offset)
    : db.prepare(`
      SELECT *
      FROM audit_events
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(sessionId, limit, offset);

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    detail: parseJson(row.detail_json, {}),
    createdAt: row.created_at
  }));
};

module.exports = {
  sanitizeText,
  createProject,
  updateProject,
  deleteProject,
  listProjects,
  getProject,
  assertProjectOwnedBySession,
  createDocument,
  getDocumentById,
  listDocuments,
  createRun,
  getRunById,
  getRunByJob,
  updateRun,
  listRuns,
  replaceRunAssets,
  listAssets,
  listAssetsByRun,
  createBatchJob,
  getBatchJob,
  updateBatchJob,
  listBatchJobs,
  createBatchItems,
  getBatchItem,
  findBatchItemByJobId,
  updateBatchItem,
  listBatchItems,
  recomputeBatchJobCounters,
  listAuditEvents,
  createAuditEvent
};
