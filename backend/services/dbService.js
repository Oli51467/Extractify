const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const config = require('../config');

let db = null;

const nowIso = () => new Date().toISOString();

const createId = (prefix) => `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

const ensureDatabaseDir = () => {
  const dir = path.dirname(config.database.file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const initializeSchema = (dbInstance) => {
  const statements = [
    `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_projects_session_updated ON projects (session_id, updated_at DESC)`,
    `
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      job_id TEXT NOT NULL DEFAULT '',
      source_name TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_documents_project_created ON documents (project_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_documents_session_created ON documents (session_id, created_at DESC)`,
    `
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      job_id TEXT NOT NULL DEFAULT '',
      batch_id TEXT NOT NULL DEFAULT '',
      document_id TEXT,
      source_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      params_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_runs_project_created ON runs (project_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_runs_job ON runs (job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_runs_batch ON runs (batch_id, created_at DESC)`,
    `
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      job_id TEXT NOT NULL DEFAULT '',
      document_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      width INTEGER,
      height INTEGER,
      page INTEGER,
      deduped INTEGER NOT NULL DEFAULT 0,
      is_primary INTEGER NOT NULL DEFAULT 1,
      source_context_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_assets_project_created ON assets (project_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_assets_run_created ON assets (run_id, created_at DESC)`,
    `
    CREATE TABLE IF NOT EXISTS batch_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      total_items INTEGER NOT NULL DEFAULT 0,
      queued_items INTEGER NOT NULL DEFAULT 0,
      processing_items INTEGER NOT NULL DEFAULT 0,
      completed_items INTEGER NOT NULL DEFAULT 0,
      failed_items INTEGER NOT NULL DEFAULT 0,
      cancelled_items INTEGER NOT NULL DEFAULT 0,
      params_json TEXT NOT NULL DEFAULT '{}',
      error TEXT NOT NULL DEFAULT '',
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_batch_jobs_project_created ON batch_jobs (project_id, created_at DESC)`,
    `
    CREATE TABLE IF NOT EXISTS batch_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      run_id TEXT NOT NULL DEFAULT '',
      job_id TEXT NOT NULL DEFAULT '',
      document_id TEXT NOT NULL DEFAULT '',
      source_name TEXT NOT NULL DEFAULT '',
      original_filename TEXT NOT NULL DEFAULT '',
      file_type TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      params_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (batch_id) REFERENCES batch_jobs(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_batch_items_batch_created ON batch_items (batch_id, created_at ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_batch_items_status ON batch_items (status, updated_at DESC)`,
    `
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL DEFAULT '',
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_audit_session_created ON audit_events (session_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_project_created ON audit_events (project_id, created_at DESC)`
  ];

  const migrate = dbInstance.transaction(() => {
    statements.forEach((sql) => dbInstance.prepare(sql).run());

    const projectColumns = dbInstance.prepare('PRAGMA table_info(projects)').all();
    const hasWorkspaceType = projectColumns.some((column) => column.name === 'workspace_type');
    if (!hasWorkspaceType) {
      dbInstance.prepare(`
        ALTER TABLE projects
        ADD COLUMN workspace_type TEXT NOT NULL DEFAULT 'extract'
      `).run();
    }

    dbInstance.prepare(`
      UPDATE projects
      SET workspace_type = 'extract'
      WHERE workspace_type IS NULL OR TRIM(workspace_type) = ''
    `).run();

    dbInstance.prepare(`
      CREATE INDEX IF NOT EXISTS idx_projects_session_type_updated
      ON projects (session_id, workspace_type, updated_at DESC)
    `).run();
  });
  migrate();
};

const getDb = () => {
  if (db) return db;

  ensureDatabaseDir();
  db = new Database(config.database.file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  initializeSchema(db);
  return db;
};

const parseJson = (value, fallback = {}) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const toJson = (value) => {
  try {
    return JSON.stringify(value || {});
  } catch (error) {
    return '{}';
  }
};

module.exports = {
  getDb,
  createId,
  nowIso,
  parseJson,
  toJson
};
