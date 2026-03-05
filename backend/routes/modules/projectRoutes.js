const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../../config');
const documentController = require('../../controllers/documentController');
const projectController = require('../../controllers/projectController');
const jobService = require('../../services/jobService');
const { normalizeUploadedFilename } = require('../../utils/filename');
const { createUploader } = require('../helpers/uploadFactory');
const { ensureProjectAccess, initUploadJob, safeSegment } = require('../helpers/routeGuards');

const router = express.Router();

const projectUpload = createUploader((req) => {
  const projectId = safeSegment(req.params.projectId, 'project');
  const jobId = req.jobId || jobService.sanitizeJobId(req.headers['x-job-id']);
  req.jobId = jobId;
  return path.join(config.paths.uploadRoot, 'projects', projectId, 'documents');
});

const initMergedImageUpload = (req, res, next) => {
  req.mergeImageUploadKey = safeSegment(
    `merge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    'merge'
  );
  return next();
};

const mergedImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = safeSegment(req.params.projectId, 'project');
    const uploadKey = safeSegment(req.mergeImageUploadKey, 'merge');
    const uploadDir = path.join(config.paths.uploadRoot, 'projects', projectId, 'runs', uploadKey, 'images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    file.originalname = normalizeUploadedFilename(file.originalname, 'merged_image.png');
    const rawExt = path.extname(file.originalname || '').toLowerCase();
    const ext = rawExt || '.png';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `merged-${uniqueSuffix}${ext}`);
  }
});

const mergedImageUpload = multer({
  storage: mergedImageStorage,
  limits: {
    fileSize: config.upload.maxFileSizeBytes
  },
  fileFilter: (req, file, cb) => {
    file.originalname = normalizeUploadedFilename(file.originalname, 'merged_image.png');
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isImageMime = String(file.mimetype || '').toLowerCase().startsWith('image/');
    const isImageExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext);
    if (isImageMime || isImageExt) {
      cb(null, true);
      return;
    }
    cb(new Error('仅支持上传图片文件'), false);
  }
});

router.get('/projects', projectController.listProjects);
router.post('/projects', projectController.createProject);
router.get('/projects/:projectId', ensureProjectAccess, projectController.getProject);
router.patch('/projects/:projectId', ensureProjectAccess, projectController.updateProject);
router.delete('/projects/:projectId', ensureProjectAccess, projectController.deleteProject);
router.get('/projects/:projectId/documents', ensureProjectAccess, projectController.listProjectDocuments);
router.delete(
  '/projects/:projectId/documents/:documentId',
  ensureProjectAccess,
  projectController.deleteProjectDocument
);
router.get(
  '/projects/:projectId/documents/:documentId/preview',
  ensureProjectAccess,
  projectController.previewProjectDocument
);
router.get('/projects/:projectId/runs', ensureProjectAccess, projectController.listProjectRuns);
router.get('/projects/:projectId/assets', ensureProjectAccess, projectController.listProjectAssets);
router.patch('/projects/:projectId/assets/:assetId/ocr', ensureProjectAccess, projectController.updateProjectAssetOcr);
router.post(
  '/projects/:projectId/assets/merged-image',
  ensureProjectAccess,
  initMergedImageUpload,
  mergedImageUpload.single('file'),
  projectController.uploadMergedAsset
);
router.get('/projects/:projectId/audit', ensureProjectAccess, projectController.listProjectAudit);

router.post(
  '/projects/:projectId/documents/extract-images',
  ensureProjectAccess,
  initUploadJob,
  projectUpload.single('file'),
  documentController.extractImages
);

module.exports = router;
