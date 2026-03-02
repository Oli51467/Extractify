const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const documentController = require('../controllers/documentController');
const config = require('../config');
const jobService = require('../services/jobService');

// 初始化任务ID，确保每次上传独立隔离
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
  jobService.updateJob(jobId, {
    status: 'uploading',
    progress: 0,
    message: '等待文件上传...'
  }, req.sessionId);
  next();
};

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const jobId = req.jobId || jobService.sanitizeJobId(req.headers['x-job-id']);
    req.jobId = jobId;

    const uploadDir = path.join(config.paths.jobsRoot, jobId, 'documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  // 检查文件类型
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    'application/pdf' // .pdf
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.docx', '.doc', '.pdf'];
  
  if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型，仅支持 Word 文档和 PDF 文件'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: config.upload.maxFileSizeBytes
  }
});

// 路由
router.get('/session', (req, res) => {
  res.json({
    success: true
  });
});

router.post('/documents/extract-images', initUploadJob, upload.single('file'), documentController.extractImages);
router.get('/documents/jobs/:jobId', documentController.getJobStatus);
router.get('/documents/download-images', documentController.downloadImages);

module.exports = router; 
