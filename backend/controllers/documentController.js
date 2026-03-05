const path = require('path');
const fs = require('fs');
const documentService = require('../services/documentService');
const projectService = require('../services/projectService');
const shareService = require('../services/shareService');
const config = require('../config');
const jobService = require('../services/jobService');
const { normalizeUploadedFilename } = require('../utils/filename');

const SUPPORTED_EXTENSIONS = ['.docx', '.doc', '.pptx', '.ppt', '.pdf', '.md', '.markdown'];
const IMAGE_PROCESSING_MODE_RAW = 'raw';
const IMAGE_PROCESSING_MODE_SMART = 'smart';

const parseBooleanFlag = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
};

const parseImageProcessingMode = (
  value,
  defaultValue = config.processing.imageProcessingModeDefault || IMAGE_PROCESSING_MODE_RAW
) => {
  const fallback = String(defaultValue || '').trim().toLowerCase() === IMAGE_PROCESSING_MODE_SMART
    ? IMAGE_PROCESSING_MODE_SMART
    : IMAGE_PROCESSING_MODE_RAW;

  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') {
    return value ? IMAGE_PROCESSING_MODE_SMART : IMAGE_PROCESSING_MODE_RAW;
  }

  const normalized = String(value).trim().toLowerCase();
  if ([
    IMAGE_PROCESSING_MODE_SMART,
    'filter',
    'filtered',
    '1',
    'true',
    'yes',
    'on'
  ].includes(normalized)) {
    return IMAGE_PROCESSING_MODE_SMART;
  }
  if ([
    IMAGE_PROCESSING_MODE_RAW,
    'all',
    '0',
    'false',
    'no',
    'off'
  ].includes(normalized)) {
    return IMAGE_PROCESSING_MODE_RAW;
  }

  return fallback;
};

const toUserError = (error, code = '', statusCode = 500) => {
  const next = new Error(error?.message || '处理失败');
  next.code = code || error?.code || '';
  next.statusCode = statusCode;
  return next;
};

const validateFileType = (filePath) => {
  const fileExt = path.extname(filePath || '').toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(fileExt)) {
    throw toUserError(
      new Error('不支持的文件类型，仅支持 .docx、.doc、.pptx、.ppt、.pdf、.md 和 .markdown 文件'),
      'UNSUPPORTED_FILE_TYPE',
      400
    );
  }
  return fileExt;
};

const safeSegment = (value, fallback = 'unknown') => {
  const next = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 100);
  return next || fallback;
};

const ensureOutputDir = (jobId, projectId = '') => {
  const outputDir = projectId
    ? path.join(config.paths.uploadRoot, 'projects', safeSegment(projectId, 'project'), 'runs', safeSegment(jobId, 'job'), 'images')
    : path.join(config.paths.jobsRoot, jobId, 'images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
};

const buildSuccessMessage = (result) => {
  if (!result || !Array.isArray(result.images)) return '图片提取成功';
  if (result.images.length === 0) return '文档中未找到图片';
  const detailParts = [];
  const filteredCount = Number(result?.smart?.filteredCount || 0);
  const dedupedCount = Number(result?.dedupe?.dedupedCount || 0);

  if (filteredCount > 0) {
    detailParts.push(`已过滤 ${filteredCount} 张装饰图`);
  }
  if (dedupedCount > 0) {
    detailParts.push(`已去重 ${dedupedCount} 张`);
  }

  if (detailParts.length > 0) {
    return `图片提取成功，共 ${result.images.length} 张（${detailParts.join('，')}）`;
  }

  return `图片提取成功，共 ${result.images.length} 张`;
};

const enrichSharePayload = (share) => {
  if (!share) return null;
  return shareService.buildPublicSharePayload(share);
};

const persistRunState = (runContext, patch = {}) => {
  if (!runContext || !runContext.projectId || !runContext.runId) return;
  try {
    projectService.updateRun(runContext.sessionId, runContext.projectId, runContext.runId, patch);
  } catch (error) {
    // 历史写入失败不影响主链路
    console.error('更新运行历史失败:', error);
  }
};

const processExtractionTask = async (options = {}) => {
  const sessionId = String(options.sessionId || '');
  const jobId = jobService.sanitizeJobId(options.jobId || '');
  const file = options.file;
  const dedupeEnabled = parseBooleanFlag(options.dedupeEnabled, config.processing.imageDedupeEnabled);
  const ocrEnabled = parseBooleanFlag(options.ocrEnabled, config.processing.autoOcrEnabled);
  const autoNamingEnabled = parseBooleanFlag(options.autoNamingEnabled, config.processing.autoNamingEnabled);
  const imageProcessingMode = parseImageProcessingMode(
    options.imageProcessingMode,
    config.processing.imageProcessingModeDefault
  );
  const shareEnabled = parseBooleanFlag(options.shareEnabled, config.share.enabled);
  const projectId = String(options.projectId || '').trim();
  const batchId = String(options.batchId || '').trim();
  const sourceNameOverride = String(options.sourceName || '').trim();
  const documentIdHint = String(options.documentId || '').trim();
  const originalNameOverride = String(options.originalFilename || '').trim();
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  if (!file || !file.path) {
    throw toUserError(new Error('没有上传文件'), 'EMPTY_FILE', 400);
  }

  const inputFilePath = file.path;
  const fileExt = validateFileType(inputFilePath);
  const originalName = normalizeUploadedFilename(
    originalNameOverride || file.originalname || path.basename(inputFilePath),
    path.basename(inputFilePath)
  );
  const sourceName = normalizeUploadedFilename(
    sourceNameOverride || path.basename(originalName, path.extname(originalName)),
    '未命名文档'
  );

  jobService.updateJob(jobId, {
    status: 'uploaded',
    progress: 10,
    message: '文件上传完成，等待处理...',
    sourceFileName: originalName,
    fileType: fileExt,
    dedupeEnabled,
    ocrEnabled,
    autoNamingEnabled,
    imageProcessingMode,
    shareEnabled
  }, sessionId);

  const outputDir = ensureOutputDir(jobId, projectId);

  let runContext = null;
  if (projectId) {
    projectService.assertProjectOwnedBySession(sessionId, projectId);
    const document = documentIdHint
      ? projectService.getDocumentById(sessionId, projectId, documentIdHint)
      : projectService.createDocument(sessionId, projectId, {
        jobId,
        sourceName,
        originalFilename: originalName,
        fileType: fileExt,
        fileSize: Number(file.size || 0),
        storagePath: inputFilePath
      });

    if (!document) {
      throw toUserError(new Error('文档不存在或无权限访问'), 'DOCUMENT_NOT_FOUND', 404);
    }

    const run = projectService.createRun(sessionId, projectId, {
      jobId,
      batchId,
      documentId: document.id,
      sourceName,
      status: 'queued',
      progress: 10,
      message: '文件上传完成，等待处理...',
      params: {
        dedupeEnabled,
        ocrEnabled,
        autoNamingEnabled,
        imageProcessingMode,
        shareEnabled
      }
    });

    runContext = {
      sessionId,
      projectId,
      runId: run.id,
      documentId: document.id,
      sourceName,
      fileType: document.fileType || fileExt
    };
  }

  try {
    const result = await jobService.enqueueJob(jobId, (reportProgress) => {
      const reportAll = (patch) => {
        reportProgress(patch);
        persistRunState(runContext, patch);
        if (onProgress) onProgress(patch);
      };

      reportAll({
        status: 'processing',
        progress: 20,
        message: `开始处理文档：${sourceName}`
      });

      return documentService.extractImages(inputFilePath, outputDir, {
        enableDedupe: dedupeEnabled,
        enableOcr: ocrEnabled,
        enableAutoNaming: autoNamingEnabled,
        imageProcessingMode,
        sourceName,
        onProgress: reportAll
      });
    }, 15);

    let shareInfo = null;
    if (shareEnabled && result.zipAbsolutePath) {
      try {
        shareInfo = shareService.createShareLink({
          sessionId,
          projectId,
          runId: runContext?.runId || '',
          jobId,
          sourceName,
          zipAbsolutePath: result.zipAbsolutePath,
          imageCount: Array.isArray(result.images) ? result.images.length : 0
        });
      } catch (error) {
        console.error('创建分享链接失败:', error);
      }
    }

    const successMessage = buildSuccessMessage(result);
    jobService.updateJob(jobId, {
      status: 'completed',
      progress: 100,
      message: successMessage,
      result: {
        imageCount: result.images.length,
        zipUrl: result.zipPath || '',
        dedupe: result.dedupe || null,
        naming: result.naming || null,
        ocr: result.ocr || null,
        smart: result.smart || null,
        share: shareInfo || null
      }
    }, sessionId);

    if (runContext) {
      persistRunState(runContext, {
        status: 'completed',
        progress: 100,
        message: successMessage,
        result: {
          imageCount: result.images.length,
          zipUrl: result.zipPath || '',
          dedupe: result.dedupe || null,
          naming: result.naming || null,
          ocr: result.ocr || null,
          smart: result.smart || null,
          share: shareInfo || null
        },
        finishedAt: new Date().toISOString()
      });

      try {
        projectService.replaceRunAssets(
          sessionId,
          runContext.projectId,
          runContext.runId,
          {
            images: result.images || [],
            sourceName: runContext.sourceName,
            documentId: runContext.documentId,
            fileType: runContext.fileType || fileExt,
            jobId
          }
        );
      } catch (assetError) {
        console.error('保存图片追溯记录失败:', assetError);
      }
    }

    return {
      jobId,
      fileExt,
      sourceName,
      result,
      share: shareInfo,
      projectId: runContext ? runContext.projectId : '',
      runId: runContext ? runContext.runId : '',
      documentId: runContext ? runContext.documentId : ''
    };
  } catch (error) {
    jobService.updateJob(jobId, {
      status: 'failed',
      progress: 100,
      message: error.message || '图片提取失败',
      error: error.toString()
    }, sessionId);

    persistRunState(runContext, {
      status: 'failed',
      progress: 100,
      message: error.message || '图片提取失败',
      error: error.toString(),
      finishedAt: new Date().toISOString()
    });

    throw error;
  }
};

// 处理上传的文档并提取图片
const extractImages = async (req, res) => {
  const jobId = req.jobId || jobService.sanitizeJobId(req.headers['x-job-id']);
  const sessionId = req.sessionId;
  const dedupeEnabled = parseBooleanFlag(req.body?.dedupe, config.processing.imageDedupeEnabled);
  const ocrEnabled = parseBooleanFlag(req.body?.ocr, config.processing.autoOcrEnabled);
  const autoNamingEnabled = parseBooleanFlag(req.body?.autoNaming, config.processing.autoNamingEnabled);
  const imageProcessingMode = parseImageProcessingMode(
    req.body?.imageMode ?? req.body?.smartFilter,
    config.processing.imageProcessingModeDefault
  );
  const shareEnabled = parseBooleanFlag(req.body?.share, config.share.enabled);
  const projectId = String(req.body?.projectId || req.params?.projectId || '').trim();
  req.setTimeout(config.server.requestTimeoutMs);

  try {
    const task = await processExtractionTask({
      sessionId,
      jobId,
      file: req.file,
      dedupeEnabled,
      ocrEnabled,
      autoNamingEnabled,
      imageProcessingMode,
      shareEnabled,
      projectId
    });

    const images = task.result.images || [];
    return res.json({
      success: true,
      message: images.length > 0 ? '图片提取成功' : '文档中未找到图片',
      images,
      zipUrl: task.result.zipPath || '',
      dedupe: task.result.dedupe || null,
      naming: task.result.naming || null,
      ocr: task.result.ocr || null,
      smart: task.result.smart || null,
      share: enrichSharePayload(task.share),
      projectId: task.projectId || '',
      runId: task.runId || '',
      documentId: task.documentId || '',
      jobId: task.jobId
    });
  } catch (error) {
    if (error.code === 'JOB_QUEUE_FULL') {
      return res.status(429).json({
        success: false,
        message: error.message,
        jobId
      });
    }

    const statusCode = Number(error.statusCode) || (error.code === 'PROJECT_NOT_FOUND' ? 404 : 500);
    return res.status(statusCode).json({
      success: false,
      message: error.message || '图片提取失败',
      error: error.toString(),
      jobId
    });
  }
};

// 获取任务状态（用于真实进度展示）
const getJobStatus = (req, res) => {
  const job = jobService.getJob(req.params.jobId, req.sessionId);
  if (!job) {
    return res.status(404).json({
      success: false,
      message: '任务不存在'
    });
  }

  return res.json({
    success: true,
    job
  });
};

// 下载图片压缩包
const downloadImages = (req, res) => {
  try {
    const rawJobId = req.query.jobId || req.params.jobId || '';
    const jobId = jobService.sanitizeJobId(rawJobId);
    const canAccess = jobService.isJobOwnedBySession(jobId, req.sessionId);
    const zipFilePath = path.join(config.paths.jobsRoot, jobId, 'images', 'images.zip');

    if (!rawJobId) {
      return res.status(400).json({
        success: false,
        message: '缺少 jobId 参数'
      });
    }

    if (!canAccess) {
      return res.status(404).json({
        success: false,
        message: '压缩包不存在'
      });
    }

    if (!fs.existsSync(zipFilePath)) {
      return res.status(404).json({
        success: false,
        message: '压缩包不存在'
      });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="images.zip"');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    const fileStream = fs.createReadStream(zipFilePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('下载压缩包错误:', error);
    res.status(500).json({
      success: false,
      message: '下载压缩包失败',
      error: error.message
    });
  }
};

module.exports = {
  parseBooleanFlag,
  parseImageProcessingMode,
  processExtractionTask,
  extractImages,
  getJobStatus,
  downloadImages
};
