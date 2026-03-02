const jobService = require('../services/jobService');

const normalizeUploadPath = (rawPath = '') => rawPath.replace(/\\/g, '/');

const uploadAuthMiddleware = (req, res, next) => {
  const pathName = normalizeUploadPath(req.path || '');

  // 只允许访问任务目录下的文件，避免暴露其他上传目录
  if (!pathName.startsWith('/jobs/')) {
    return res.status(404).end();
  }

  const parts = pathName.split('/').filter(Boolean);
  // 至少是 /jobs/:jobId/:resource
  if (parts.length < 3) {
    return res.status(404).end();
  }

  const [, rawJobId] = parts;
  const canAccess = jobService.isJobOwnedBySession(rawJobId, req.sessionId);
  if (!canAccess) {
    // 返回 404 避免泄露任务是否存在
    return res.status(404).end();
  }

  return next();
};

module.exports = uploadAuthMiddleware;
