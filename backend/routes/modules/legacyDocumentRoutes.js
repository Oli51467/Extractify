const express = require('express');
const path = require('path');
const config = require('../../config');
const documentController = require('../../controllers/documentController');
const jobService = require('../../services/jobService');
const { initUploadJob } = require('../helpers/routeGuards');
const { createUploader } = require('../helpers/uploadFactory');

const router = express.Router();

const legacyUpload = createUploader((req) => {
  const jobId = req.jobId || jobService.sanitizeJobId(req.headers['x-job-id']);
  req.jobId = jobId;
  return path.join(config.paths.jobsRoot, jobId, 'documents');
});

router.post('/documents/extract-images', initUploadJob, legacyUpload.single('file'), documentController.extractImages);
router.get('/documents/jobs/:jobId', documentController.getJobStatus);
router.get('/documents/download-images', documentController.downloadImages);

module.exports = router;
