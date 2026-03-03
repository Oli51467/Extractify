const batchProcessingService = require('../services/batchProcessingService');
const projectService = require('../services/projectService');
const { parseBooleanFlag } = require('./documentController');
const config = require('../config');

const createBatch = (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    const dedupeEnabled = parseBooleanFlag(req.body?.dedupe, config.processing.imageDedupeEnabled);
    const result = batchProcessingService.createBatchFromUploadedFiles(
      req.sessionId,
      req.params.projectId,
      files,
      {
        dedupeEnabled,
        name: req.body?.name || ''
      }
    );

    return res.status(202).json({
      success: true,
      message: '批量任务已创建，正在后台处理',
      batch: result.batch,
      items: result.items
    });
  } catch (error) {
    console.error('创建批量任务失败:', error);
    const statusCode = error.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '创建批量任务失败'
    });
  }
};

const retryFailed = (req, res) => {
  try {
    const result = batchProcessingService.retryFailedItems(
      req.sessionId,
      req.params.projectId,
      req.params.batchId
    );
    return res.json({
      success: true,
      retriedCount: result.retriedCount,
      batch: result.batch
    });
  } catch (error) {
    console.error('重试批量任务失败:', error);
    const statusCode = error.code === 'BATCH_NOT_FOUND' ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '重试失败项失败'
    });
  }
};

const cancelQueued = (req, res) => {
  try {
    const result = batchProcessingService.cancelQueuedItems(
      req.sessionId,
      req.params.projectId,
      req.params.batchId
    );
    return res.json({
      success: true,
      cancelledCount: result.cancelledCount,
      batch: result.batch
    });
  } catch (error) {
    console.error('取消批量任务失败:', error);
    const statusCode = error.code === 'BATCH_NOT_FOUND' ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '取消批量任务失败'
    });
  }
};

const getBatchDetail = (req, res) => {
  try {
    const batch = projectService.getBatchJob(req.sessionId, req.params.projectId, req.params.batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: '批量任务不存在'
      });
    }

    const items = projectService.listBatchItems(req.sessionId, req.params.projectId, req.params.batchId, {
      limit: 1000
    });

    return res.json({
      success: true,
      batch,
      items
    });
  } catch (error) {
    const statusCode = error.code === 'BATCH_NOT_FOUND' ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '获取批量任务详情失败'
    });
  }
};

module.exports = {
  createBatch,
  retryFailed,
  cancelQueued,
  getBatchDetail
};
