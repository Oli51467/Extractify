const projectService = require('../../services/projectService');
const jobService = require('../../services/jobService');

const safeSegment = (value, fallback = 'unknown') => {
  const next = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 100);
  return next || fallback;
};

const initUploadJob = (req, res, next) => {
  const requestJobId = req.headers['x-job-id'];
  const jobId = jobService.sanitizeJobId(requestJobId);
  const existingJob = jobService.findJob(jobId);

  if (existingJob && existingJob.ownerSessionId !== req.sessionId) {
    return res.status(403).json({
      success: false,
      message: '无权访问该任务'
    });
  }

  req.jobId = jobId;
  jobService.updateJob(
    jobId,
    {
      status: 'uploading',
      progress: 0,
      message: '等待文件上传...'
    },
    req.sessionId
  );
  return next();
};

const ensureProjectAccess = (req, res, next) => {
  try {
    projectService.assertProjectOwnedBySession(req.sessionId, req.params.projectId);
    return next();
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: '项目不存在'
    });
  }
};

const initBatchUploadContext = (req, res, next) => {
  req.batchUploadKey = `batch_upload_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return next();
};

module.exports = {
  safeSegment,
  initUploadJob,
  ensureProjectAccess,
  initBatchUploadContext
};
