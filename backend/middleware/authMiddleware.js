const config = require('../config');
const authService = require('../services/authService');

const resolveSessionUser = (req) => {
  if (Object.prototype.hasOwnProperty.call(req, 'authUser')) {
    return req.authUser || null;
  }

  const user = authService.getSessionUser(req.sessionId);
  req.authUser = user;
  return user;
};

const requireAuth = (req, res, next) => {
  if (!config.auth.enabled) return next();

  const user = resolveSessionUser(req);
  if (user) return next();

  return res.status(401).json({
    success: false,
    code: 'AUTH_REQUIRED',
    message: '请先登录后再访问'
  });
};

module.exports = {
  requireAuth,
  resolveSessionUser
};
