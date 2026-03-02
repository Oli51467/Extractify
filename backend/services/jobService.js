const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

const jobs = new Map();
const queue = [];
let activeCount = 0;

const MAX_JOB_ID_LENGTH = 64;
const createForbiddenError = () => {
  const error = new Error('无权访问该任务');
  error.code = 'JOB_FORBIDDEN';
  return error;
};

const clampProgress = (value) => {
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num);
};

const sanitizeJobId = (rawJobId) => {
  const value = String(rawJobId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, MAX_JOB_ID_LENGTH);

  if (value) return value;
  return `job_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
};

const getQueuePosition = (jobId) => {
  const index = queue.findIndex(item => item.jobId === jobId);
  return index === -1 ? 0 : index + 1;
};

const findJob = (rawJobId) => {
  if (!rawJobId) return null;
  const jobId = sanitizeJobId(rawJobId);
  return jobs.get(jobId) || null;
};

const ensureJobOwnership = (job, ownerSessionId) => {
  if (!job || !ownerSessionId) return job;

  if (job.ownerSessionId && job.ownerSessionId !== ownerSessionId) {
    throw createForbiddenError();
  }

  if (!job.ownerSessionId) {
    job.ownerSessionId = ownerSessionId;
  }

  return job;
};

const getOrCreateJob = (rawJobId, ownerSessionId = '') => {
  const jobId = sanitizeJobId(rawJobId);
  const current = jobs.get(jobId);
  if (current) {
    return ensureJobOwnership(current, ownerSessionId);
  }

  const now = new Date().toISOString();
  const job = {
    jobId,
    ownerSessionId: ownerSessionId || '',
    status: 'created',
    progress: 0,
    message: '任务已创建',
    error: null,
    sourceFileName: '',
    fileType: '',
    result: null,
    createdAt: now,
    updatedAt: now
  };
  jobs.set(jobId, job);
  return job;
};

const updateJob = (rawJobId, patch = {}, ownerSessionId = '') => {
  const job = getOrCreateJob(rawJobId, ownerSessionId);
  const next = { ...job, ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, 'progress')) {
    next.progress = clampProgress(patch.progress);
  }
  if (ownerSessionId && !next.ownerSessionId) {
    next.ownerSessionId = ownerSessionId;
  }
  next.updatedAt = new Date().toISOString();
  jobs.set(job.jobId, next);
  return next;
};

const getJob = (rawJobId, ownerSessionId = '') => {
  if (!rawJobId) return null;
  const jobId = sanitizeJobId(rawJobId);
  const job = jobs.get(jobId);
  if (!job) return null;

  if (ownerSessionId && job.ownerSessionId && job.ownerSessionId !== ownerSessionId) {
    return null;
  }

  const { ownerSessionId: _, ...safeJob } = job;
  return {
    ...safeJob,
    queuePosition: getQueuePosition(jobId),
    queueConcurrency: config.jobs.queueConcurrency,
    activeWorkers: activeCount
  };
};

const isJobOwnedBySession = (rawJobId, ownerSessionId = '') => {
  const job = findJob(rawJobId);
  if (!job || !ownerSessionId) return false;
  return job.ownerSessionId === ownerSessionId;
};

const processQueue = () => {
  while (activeCount < config.jobs.queueConcurrency && queue.length > 0) {
    const task = queue.shift();
    activeCount += 1;

    updateJob(task.jobId, {
      status: 'processing',
      progress: Math.max(task.baseProgress || 20, 20),
      message: '正在处理文档...'
    });

    Promise.resolve()
      .then(() => task.worker((progressPatch) => updateJob(task.jobId, progressPatch)))
      .then((result) => task.resolve(result))
      .catch((error) => {
        updateJob(task.jobId, {
          status: 'failed',
          progress: 100,
          message: error.message || '处理失败',
          error: error.message || String(error)
        });
        task.reject(error);
      })
      .finally(() => {
        activeCount -= 1;
        processQueue();
      });
  }
};

const enqueueJob = (rawJobId, worker, baseProgress = 20) => {
  const job = getOrCreateJob(rawJobId);

  if (queue.length >= config.jobs.queueMaxSize) {
    const error = new Error('任务队列已满，请稍后重试');
    error.code = 'JOB_QUEUE_FULL';
    throw error;
  }

  updateJob(job.jobId, {
    status: 'queued',
    progress: baseProgress,
    message: '任务已进入处理队列'
  });

  return new Promise((resolve, reject) => {
    queue.push({
      jobId: job.jobId,
      worker,
      resolve,
      reject,
      baseProgress
    });
    processQueue();
  });
};

const cleanupExpiredJobs = async () => {
  const now = Date.now();
  const expiresBefore = now - config.jobs.retentionMs;

  for (const [jobId, job] of jobs.entries()) {
    const updatedAt = new Date(job.updatedAt).getTime();
    if (Number.isNaN(updatedAt) || updatedAt > expiresBefore) continue;

    const jobDir = path.join(config.paths.jobsRoot, jobId);
    try {
      await fs.promises.rm(jobDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`清理任务目录失败: ${jobDir}`, error);
    }

    jobs.delete(jobId);
  }

  try {
    const entries = await fs.promises.readdir(config.paths.jobsRoot, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isDirectory()) return;
      const jobDir = path.join(config.paths.jobsRoot, entry.name);
      try {
        const stat = await fs.promises.stat(jobDir);
        if (stat.mtimeMs < expiresBefore) {
          await fs.promises.rm(jobDir, { recursive: true, force: true });
        }
      } catch (error) {
        console.error(`清理旧任务目录失败: ${jobDir}`, error);
      }
    }));
  } catch (error) {
    console.error('扫描任务目录失败:', error);
  }
};

module.exports = {
  sanitizeJobId,
  findJob,
  getOrCreateJob,
  updateJob,
  getJob,
  isJobOwnedBySession,
  enqueueJob,
  cleanupExpiredJobs
};
