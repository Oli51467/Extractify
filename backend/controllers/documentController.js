const path = require('path');
const fs = require('fs');
const documentService = require('../services/documentService');
const config = require('../config');
const jobService = require('../services/jobService');

const parseBooleanFlag = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
};

// 处理上传的文档并提取图片
exports.extractImages = async (req, res) => {
  const jobId = req.jobId || jobService.sanitizeJobId(req.headers['x-job-id']);
  const sessionId = req.sessionId;
  const dedupeEnabled = parseBooleanFlag(req.body?.dedupe, config.processing.imageDedupeEnabled);
  req.setTimeout(config.server.requestTimeoutMs);

  try {
    if (!req.file) {
      jobService.updateJob(jobId, {
        status: 'failed',
        progress: 100,
        message: '没有上传文件'
      }, sessionId);
      return res.status(400).json({
        success: false,
        message: '没有上传文件',
        jobId
      });
    }

    const inputFilePath = req.file.path;
    const fileName = path.basename(req.file.originalname || inputFilePath, path.extname(inputFilePath));
    const fileExt = path.extname(inputFilePath).toLowerCase();

    jobService.updateJob(jobId, {
      status: 'uploaded',
      progress: 10,
      message: '文件上传完成，等待处理...',
      sourceFileName: req.file.originalname || '',
      fileType: fileExt,
      dedupeEnabled
    }, sessionId);

    // 检查文件类型
    if (!['.docx', '.doc', '.pdf'].includes(fileExt)) {
      jobService.updateJob(jobId, {
        status: 'failed',
        progress: 100,
        message: '不支持的文件类型'
      }, sessionId);
      return res.status(400).json({
        success: false,
        message: '不支持的文件类型，仅支持 .docx、.doc 和 .pdf 文件',
        jobId
      });
    }

    // 每个任务独立输出目录，避免多用户互相覆盖
    const outputDir = path.join(config.paths.jobsRoot, jobId, 'images');

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
      const result = await jobService.enqueueJob(jobId, (reportProgress) => {
        reportProgress({
          status: 'processing',
          progress: 20,
          message: `开始处理文档：${fileName}`
        });

        return documentService.extractImages(inputFilePath, outputDir, {
          enableDedupe: dedupeEnabled,
          onProgress: reportProgress
        });
      }, 15);

      if (result.images.length === 0) {
        jobService.updateJob(jobId, {
          status: 'completed',
          progress: 100,
          message: '文档中未找到图片',
          result: {
            imageCount: 0,
            zipUrl: '',
            dedupe: result.dedupe || null
          }
        }, sessionId);

        return res.json({
          success: true,
          message: '文档中未找到图片',
          images: [],
          zipUrl: '',
          dedupe: result.dedupe || null,
          jobId
        });
      }

      jobService.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: result.dedupe && result.dedupe.dedupedCount > 0
          ? `图片提取成功，共 ${result.images.length} 张（已去重 ${result.dedupe.dedupedCount} 张）`
          : `图片提取成功，共 ${result.images.length} 张`,
        result: {
          imageCount: result.images.length,
          zipUrl: result.zipPath,
          dedupe: result.dedupe || null
        }
      }, sessionId);

      res.json({
        success: true,
        message: '图片提取成功',
        images: result.images,
        zipUrl: result.zipPath,
        dedupe: result.dedupe || null,
        jobId
      });
    } catch (extractError) {
      console.error('图片提取过程错误:', extractError);

      if (extractError.code === 'JOB_QUEUE_FULL') {
        return res.status(429).json({
          success: false,
          message: extractError.message,
          jobId
        });
      }

      jobService.updateJob(jobId, {
        status: 'failed',
        progress: 100,
        message: extractError.message || '图片提取失败',
        error: extractError.toString()
      }, sessionId);

      return res.status(500).json({
        success: false,
        message: extractError.message || '图片提取失败',
        error: extractError.toString(),
        jobId
      });
    }
  } catch (error) {
    console.error('图片提取控制器错误:', error);
    jobService.updateJob(jobId, {
      status: 'failed',
      progress: 100,
      message: error.message || '图片提取失败',
      error: error.message
    }, sessionId);

    res.status(500).json({
      success: false,
      message: '图片提取失败',
      error: error.message,
      jobId
    });
  }
};

// 获取任务状态（用于真实进度展示）
exports.getJobStatus = (req, res) => {
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
exports.downloadImages = (req, res) => {
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
