const crypto = require('crypto');

const SESSION_ID_PATTERN = /^[a-f0-9]{64}$/i;

const parseCookies = (cookieHeader) => {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((chunk) => {
    const [rawKey, ...rest] = chunk.split('=');
    if (!rawKey) return;

    const key = rawKey.trim();
    const value = rest.join('=').trim();
    if (!key || !value) return;

    try {
      cookies[key] = decodeURIComponent(value);
    } catch (error) {
      cookies[key] = value;
    }
  });

  return cookies;
};

const appendSetCookie = (res, cookieValue) => {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', cookieValue);
    return;
  }

  if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, cookieValue]);
    return;
  }

  res.setHeader('Set-Cookie', [current, cookieValue]);
};

const normalizeSameSite = (rawValue) => {
  const value = String(rawValue || '').toLowerCase();
  if (value === 'strict') return 'Strict';
  if (value === 'none') return 'None';
  return 'Lax';
};

const serializeCookie = (name, value, options = {}) => {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAgeSeconds) segments.push(`Max-Age=${options.maxAgeSeconds}`);
  if (options.path) segments.push(`Path=${options.path}`);
  if (options.httpOnly) segments.push('HttpOnly');
  if (options.secure) segments.push('Secure');
  if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);

  return segments.join('; ');
};

const generateSessionId = () => crypto.randomBytes(32).toString('hex');

const createSessionMiddleware = (config) => {
  const cookieName = config.session.cookieName;
  const sameSite = normalizeSameSite(config.session.cookieSameSite);
  const maxAgeSeconds = Math.floor(config.session.cookieMaxAgeMs / 1000);

  return (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    let sessionId = cookies[cookieName];

    if (!SESSION_ID_PATTERN.test(sessionId || '')) {
      sessionId = generateSessionId();
      appendSetCookie(res, serializeCookie(cookieName, sessionId, {
        maxAgeSeconds,
        path: '/',
        httpOnly: true,
        secure: config.session.cookieSecure,
        sameSite
      }));
    }

    req.sessionId = sessionId;
    next();
  };
};

module.exports = createSessionMiddleware;
