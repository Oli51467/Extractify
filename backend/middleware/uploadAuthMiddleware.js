const jobService = require('../services/jobService');
const projectService = require('../services/projectService');

const normalizeUploadPath = (rawPath = '') => rawPath.replace(/\\/g, '/');

const uploadAuthMiddleware = (req, res, next) => {
  const pathName = normalizeUploadPath(req.path || '');

  if (pathName.startsWith('/jobs/')) {
    const parts = pathName.split('/').filter(Boolean);
    if (parts.length < 3) {
      return res.status(404).end();
    }

    const [, rawJobId] = parts;
    const canAccess = jobService.isJobOwnedBySession(rawJobId, req.sessionId);
    if (!canAccess) {
      return res.status(404).end();
    }

    return next();
  }

  if (pathName.startsWith('/projects/')) {
    const parts = pathName.split('/').filter(Boolean);
    if (parts.length < 3) {
      return res.status(404).end();
    }

    const [, rawProjectId] = parts;
    const project = projectService.getProject(req.sessionId, rawProjectId);
    if (!project) {
      return res.status(404).end();
    }

    return next();
  }

  // 返回 404 避免泄露目录结构
  if (!pathName.startsWith('/jobs/') && !pathName.startsWith('/projects/')) {
    return res.status(404).end();
  }
};

module.exports = uploadAuthMiddleware;
