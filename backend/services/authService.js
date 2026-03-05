const { getDb, createId, nowIso, parseJson, toJson } = require('./dbService');

const sanitizeText = (value, maxLen = 255, fallback = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLen);
};

const toBooleanInt = (value) => (value ? 1 : 0);

const mapUserRow = (row) => {
  if (!row) return null;
  return {
    id: row.user_id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    email: sanitizeText(row.email, 320, ''),
    emailVerified: Number(row.email_verified || 0) === 1,
    name: sanitizeText(row.display_name, 120, ''),
    avatarUrl: sanitizeText(row.avatar_url, 800, ''),
    profile: parseJson(row.profile_json, {}),
    linkedAt: row.session_created_at || row.created_at || '',
    updatedAt: row.session_updated_at || row.updated_at || ''
  };
};

const getSessionUser = (sessionId) => {
  const safeSessionId = sanitizeText(sessionId, 120, '');
  if (!safeSessionId) return null;

  const db = getDb();
  const row = db.prepare(`
    SELECT
      s.session_id,
      s.created_at AS session_created_at,
      s.updated_at AS session_updated_at,
      u.id AS user_id,
      u.provider,
      u.provider_user_id,
      u.email,
      u.email_verified,
      u.display_name,
      u.avatar_url,
      u.profile_json,
      u.created_at,
      u.updated_at
    FROM user_sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.session_id = ?
    LIMIT 1
  `).get(safeSessionId);

  return mapUserRow(row);
};

const upsertOAuthSessionUser = (sessionId, payload = {}) => {
  const safeSessionId = sanitizeText(sessionId, 120, '');
  const provider = sanitizeText(payload.provider, 32, '').toLowerCase();
  const providerUserId = sanitizeText(payload.providerUserId, 160, '');

  if (!safeSessionId) {
    throw new Error('会话标识缺失');
  }
  if (!provider || !providerUserId) {
    throw new Error('第三方账户信息不完整');
  }

  const email = sanitizeText(payload.email, 320, '');
  const displayName = sanitizeText(payload.name, 120, '');
  const avatarUrl = sanitizeText(payload.avatarUrl, 800, '');
  const profile = payload.profile && typeof payload.profile === 'object' ? payload.profile : {};
  const emailVerified = toBooleanInt(payload.emailVerified);

  const db = getDb();
  const now = nowIso();

  const tx = db.transaction(() => {
    const existingUser = db.prepare(`
      SELECT id
      FROM users
      WHERE provider = ? AND provider_user_id = ?
      LIMIT 1
    `).get(provider, providerUserId);

    const userId = existingUser?.id || createId('usr');
    if (existingUser) {
      db.prepare(`
        UPDATE users
        SET email = ?,
            email_verified = ?,
            display_name = ?,
            avatar_url = ?,
            profile_json = ?,
            updated_at = ?
        WHERE id = ?
      `).run(email, emailVerified, displayName, avatarUrl, toJson(profile), now, userId);
    } else {
      db.prepare(`
        INSERT INTO users (
          id, provider, provider_user_id, email, email_verified, display_name,
          avatar_url, profile_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        provider,
        providerUserId,
        email,
        emailVerified,
        displayName,
        avatarUrl,
        toJson(profile),
        now,
        now
      );
    }

    const existingSession = db.prepare(`
      SELECT session_id
      FROM user_sessions
      WHERE session_id = ?
      LIMIT 1
    `).get(safeSessionId);

    if (existingSession) {
      db.prepare(`
        UPDATE user_sessions
        SET user_id = ?, provider = ?, updated_at = ?
        WHERE session_id = ?
      `).run(userId, provider, now, safeSessionId);
    } else {
      db.prepare(`
        INSERT INTO user_sessions (
          session_id, user_id, provider, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(safeSessionId, userId, provider, now, now);
    }
  });

  tx();
  return getSessionUser(safeSessionId);
};

const clearSessionUser = (sessionId) => {
  const safeSessionId = sanitizeText(sessionId, 120, '');
  if (!safeSessionId) return;

  const db = getDb();
  db.prepare(`
    DELETE FROM user_sessions
    WHERE session_id = ?
  `).run(safeSessionId);
};

module.exports = {
  getSessionUser,
  upsertOAuthSessionUser,
  clearSessionUser
};
