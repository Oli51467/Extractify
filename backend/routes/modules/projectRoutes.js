const express = require('express');
const path = require('path');
const config = require('../../config');
const documentController = require('../../controllers/documentController');
const projectController = require('../../controllers/projectController');
const jobService = require('../../services/jobService');
const { createUploader } = require('../helpers/uploadFactory');
const { ensureProjectAccess, initUploadJob, safeSegment } = require('../helpers/routeGuards');

const router = express.Router();

const projectUpload = createUploader((req) => {
  const projectId = safeSegment(req.params.projectId, 'project');
  const jobId = req.jobId || jobService.sanitizeJobId(req.headers['x-job-id']);
  req.jobId = jobId;
  return path.join(config.paths.uploadRoot, 'projects', projectId, 'documents');
});

router.get('/projects', projectController.listProjects);
router.post('/projects', projectController.createProject);
router.get('/projects/:projectId', ensureProjectAccess, projectController.getProject);
router.patch('/projects/:projectId', ensureProjectAccess, projectController.updateProject);
router.delete('/projects/:projectId', ensureProjectAccess, projectController.deleteProject);
router.get('/projects/:projectId/documents', ensureProjectAccess, projectController.listProjectDocuments);
router.get(
  '/projects/:projectId/documents/:documentId/preview',
  ensureProjectAccess,
  projectController.previewProjectDocument
);
router.get('/projects/:projectId/runs', ensureProjectAccess, projectController.listProjectRuns);
router.get('/projects/:projectId/assets', ensureProjectAccess, projectController.listProjectAssets);
router.patch('/projects/:projectId/assets/:assetId/ocr', ensureProjectAccess, projectController.updateProjectAssetOcr);
router.get('/projects/:projectId/audit', ensureProjectAccess, projectController.listProjectAudit);

router.post(
  '/projects/:projectId/documents/extract-images',
  ensureProjectAccess,
  initUploadJob,
  projectUpload.single('file'),
  documentController.extractImages
);

module.exports = router;
