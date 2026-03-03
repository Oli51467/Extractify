const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const projectService = require('./projectService');
const jobService = require('./jobService');
const { processExtractionTask, parseBooleanFlag } = require('../controllers/documentController');
const config = require('../config');
const { normalizeUploadedFilename } = require('../utils/filename');

const activeBatchSet = new Set();

const generateJobId = () => jobService.sanitizeJobId(
  `job_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
);

const mapPatchToBatchItem = (patch = {}) => {
  const status = String(patch.status || '').toLowerCase();
  if (status === 'failed') return 'failed';
  if (status === 'completed') return 'completed';
  if (status === 'processing') return 'processing';
  return 'queued';
};

const ensureFileExists = (filePath) => {
  if (!filePath) return false;
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch (error) {
    return false;
  }
};

const updateBatchItemFromProgress = (sessionId, projectId, item, patch) => {
  const status = mapPatchToBatchItem(patch);
  return projectService.updateBatchItem(sessionId, projectId, item.id, {
    status,
    progress: Number(patch.progress || item.progress || 0),
    message: patch.message || item.message || ''
  });
};

const processBatchItem = async (sessionId, projectId, batchId, item, defaults = {}) => {
  const itemParams = item.params || {};
  const dedupeEnabled = parseBooleanFlag(itemParams.dedupeEnabled, defaults.dedupeEnabled);
  const filePath = String(itemParams.filePath || '').trim();
  const originalFilename = normalizeUploadedFilename(
    item.originalFilename || itemParams.originalFilename || item.sourceName || '',
    path.basename(filePath || 'document')
  );

  if (!ensureFileExists(filePath)) {
    throw new Error(`批量任务文件不存在: ${originalFilename || 'unknown'}`);
  }

  const workingJobId = generateJobId();
  const nextItem = projectService.updateBatchItem(sessionId, projectId, item.id, {
    status: 'queued',
    progress: 5,
    message: '等待队列处理',
    runId: '',
    jobId: workingJobId,
    params: {
      ...itemParams,
      dedupeEnabled
    }
  });
  projectService.recomputeBatchJobCounters(sessionId, projectId, batchId);

  const task = await processExtractionTask({
    sessionId,
    jobId: workingJobId,
    file: {
      path: filePath,
      originalname: originalFilename,
      size: Number(itemParams.fileSize || 0)
    },
    dedupeEnabled,
    projectId,
    batchId,
    documentId: item.documentId || '',
    sourceName: item.sourceName || '',
    originalFilename,
    onProgress: (patch) => {
      updateBatchItemFromProgress(sessionId, projectId, nextItem, patch);
    }
  });

  const resultPayload = {
    imageCount: task.result?.images?.length || 0,
    zipUrl: task.result?.zipPath || '',
    dedupe: task.result?.dedupe || null,
    naming: task.result?.naming || null,
    ocr: task.result?.ocr || null,
    share: task.share || null,
    runId: task.runId || '',
    documentId: task.documentId || ''
  };

  projectService.updateBatchItem(sessionId, projectId, item.id, {
    status: 'completed',
    progress: 100,
    message: task.result?.images?.length > 0
      ? `处理完成，提取 ${task.result.images.length} 张`
      : '处理完成，未提取到图片',
    runId: task.runId || '',
    documentId: task.documentId || '',
    result: resultPayload
  });
  projectService.recomputeBatchJobCounters(sessionId, projectId, batchId);

  return task;
};

const processBatchInternal = async (sessionId, projectId, batchId, defaults = {}) => {
  if (activeBatchSet.has(batchId)) return;
  activeBatchSet.add(batchId);

  try {
    projectService.updateBatchJob(sessionId, projectId, batchId, {
      status: 'processing',
      startedAt: new Date().toISOString(),
      error: ''
    });

    const items = projectService.listBatchItems(sessionId, projectId, batchId, { limit: 1000 })
      .filter((item) => item.status === 'queued' || item.status === 'failed');

    const tasks = items.map(async (item) => {
      try {
        await processBatchItem(sessionId, projectId, batchId, item, defaults);
      } catch (error) {
        console.error('批量子任务处理失败:', error);
        projectService.updateBatchItem(sessionId, projectId, item.id, {
          status: 'failed',
          progress: 100,
          message: error.message || '处理失败',
          error: String(error)
        });
        projectService.recomputeBatchJobCounters(sessionId, projectId, batchId);
      }
    });

    await Promise.allSettled(tasks);
    projectService.recomputeBatchJobCounters(sessionId, projectId, batchId);
  } catch (error) {
    console.error('批量任务处理失败:', error);
    projectService.updateBatchJob(sessionId, projectId, batchId, {
      status: 'failed',
      error: error.message || String(error),
      finishedAt: new Date().toISOString()
    });
  } finally {
    activeBatchSet.delete(batchId);
  }
};

const createBatchFromUploadedFiles = (sessionId, projectId, files = [], options = {}) => {
  if (!Array.isArray(files) || files.length === 0) {
    const error = new Error('未上传可处理文件');
    error.code = 'EMPTY_BATCH_FILES';
    throw error;
  }

  projectService.assertProjectOwnedBySession(sessionId, projectId);
  const dedupeEnabled = parseBooleanFlag(options.dedupeEnabled, config.processing.imageDedupeEnabled);

  const batch = projectService.createBatchJob(sessionId, projectId, {
    name: options.name || `批处理 ${new Date().toLocaleString()}`,
    status: 'queued',
    totalItems: files.length,
    params: {
      dedupeEnabled
    }
  });

  const itemsPayload = files.map((file) => {
    const originalFilename = normalizeUploadedFilename(
      file.originalname || path.basename(file.path || ''),
      path.basename(file.path || 'document')
    );
    const sourceName = normalizeUploadedFilename(
      path.basename(originalFilename, path.extname(originalFilename)),
      '未命名文档'
    );
    const ext = path.extname(originalFilename).toLowerCase();
    return {
      jobId: generateJobId(),
      sourceName,
      originalFilename,
      fileType: ext,
      status: 'queued',
      progress: 0,
      message: '等待处理',
      params: {
        filePath: file.path,
        fileSize: Number(file.size || 0),
        originalFilename,
        dedupeEnabled
      }
    };
  });

  const items = projectService.createBatchItems(sessionId, projectId, batch.id, itemsPayload);

  setImmediate(() => {
    processBatchInternal(sessionId, projectId, batch.id, {
      dedupeEnabled
    });
  });

  return {
    batch,
    items
  };
};

const retryFailedItems = (sessionId, projectId, batchId) => {
  const batch = projectService.getBatchJob(sessionId, projectId, batchId);
  if (!batch) {
    const error = new Error('批量任务不存在');
    error.code = 'BATCH_NOT_FOUND';
    throw error;
  }

  const items = projectService.listBatchItems(sessionId, projectId, batchId, { limit: 1000 });
  const failed = items.filter((item) => item.status === 'failed');
  if (failed.length === 0) {
    return {
      batch,
      retriedCount: 0
    };
  }

  failed.forEach((item) => {
    projectService.updateBatchItem(sessionId, projectId, item.id, {
      status: 'queued',
      progress: 0,
      message: '等待重试',
      error: ''
    });
  });

  projectService.recomputeBatchJobCounters(sessionId, projectId, batchId);

  setImmediate(() => {
    processBatchInternal(sessionId, projectId, batchId, {
      dedupeEnabled: parseBooleanFlag(batch?.params?.dedupeEnabled, config.processing.imageDedupeEnabled)
    });
  });

  return {
    batch: projectService.getBatchJob(sessionId, projectId, batchId),
    retriedCount: failed.length
  };
};

const cancelQueuedItems = (sessionId, projectId, batchId) => {
  const batch = projectService.getBatchJob(sessionId, projectId, batchId);
  if (!batch) {
    const error = new Error('批量任务不存在');
    error.code = 'BATCH_NOT_FOUND';
    throw error;
  }

  const items = projectService.listBatchItems(sessionId, projectId, batchId, { limit: 1000 });
  let cancelled = 0;
  items.forEach((item) => {
    if (item.status === 'queued') {
      cancelled += 1;
      projectService.updateBatchItem(sessionId, projectId, item.id, {
        status: 'cancelled',
        progress: item.progress || 0,
        message: '已取消'
      });
    }
  });

  const nextBatch = projectService.recomputeBatchJobCounters(sessionId, projectId, batchId);
  return {
    batch: nextBatch,
    cancelledCount: cancelled
  };
};

module.exports = {
  createBatchFromUploadedFiles,
  retryFailedItems,
  cancelQueuedItems
};
