const express = require('express');
const path = require('path');
const config = require('../../config');
const batchController = require('../../controllers/batchController');
const projectController = require('../../controllers/projectController');
const { ensureProjectAccess, initBatchUploadContext, safeSegment } = require('../helpers/routeGuards');
const { createUploader } = require('../helpers/uploadFactory');

const router = express.Router();

const batchUpload = createUploader((req) => {
  const projectId = safeSegment(req.params.projectId, 'project');
  const batchUploadKey = safeSegment(req.batchUploadKey, 'batch');
  return path.join(config.paths.uploadRoot, 'projects', projectId, 'batch_uploads', batchUploadKey);
});

router.get('/projects/:projectId/batches', ensureProjectAccess, projectController.listProjectBatches);
router.get('/projects/:projectId/batches/:batchId', ensureProjectAccess, batchController.getBatchDetail);
router.get('/projects/:projectId/batches/:batchId/items', ensureProjectAccess, projectController.listBatchItems);
router.post(
  '/projects/:projectId/batches/extract-images',
  ensureProjectAccess,
  initBatchUploadContext,
  batchUpload.array('files', 50),
  batchController.createBatch
);
router.post('/projects/:projectId/batches/:batchId/retry-failed', ensureProjectAccess, batchController.retryFailed);
router.post('/projects/:projectId/batches/:batchId/cancel', ensureProjectAccess, batchController.cancelQueued);

module.exports = router;
