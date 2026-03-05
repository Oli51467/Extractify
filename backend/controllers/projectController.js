const fs = require('fs');
const projectService = require('../services/projectService');
const documentPreviewService = require('../services/documentPreviewService');

const listProjects = (req, res) => {
  try {
    const projects = projectService.listProjects(req.sessionId, {
      workspaceType: req.query?.workspaceType
    });
    return res.json({
      success: true,
      projects
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || '获取项目列表失败'
    });
  }
};

const createProject = (req, res) => {
  try {
    const project = projectService.createProject(req.sessionId, {
      ...(req.body || {}),
      workspaceType: req.body?.workspaceType || req.query?.workspaceType
    });
    return res.status(201).json({
      success: true,
      project
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || '创建项目失败'
    });
  }
};

const getProject = (req, res) => {
  try {
    const project = projectService.getProject(req.sessionId, req.params.projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: '项目不存在'
      });
    }

    return res.json({
      success: true,
      project
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || '获取项目失败'
    });
  }
};

const updateProject = (req, res) => {
  try {
    const project = projectService.updateProject(req.sessionId, req.params.projectId, req.body || {});
    return res.json({
      success: true,
      project
    });
  } catch (error) {
    const statusCode = error.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '更新项目失败'
    });
  }
};

const deleteProject = (req, res) => {
  try {
    projectService.deleteProject(req.sessionId, req.params.projectId);
    return res.json({
      success: true
    });
  } catch (error) {
    const statusCode = error.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '删除项目失败'
    });
  }
};

const listProjectDocuments = (req, res) => {
  try {
    const documents = projectService.listDocuments(req.sessionId, req.params.projectId, req.query || {});
    return res.json({
      success: true,
      documents
    });
  } catch (error) {
    const statusCode = error.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '获取项目文档失败'
    });
  }
};

const encodeContentDispositionFilename = (name = '') => encodeURIComponent(String(name || '').replace(/\r|\n/g, ''));

const previewProjectDocument = async (req, res) => {
  try {
    const document = projectService.getDocumentById(req.sessionId, req.params.projectId, req.params.documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: '文档不存在'
      });
    }

    const preview = await documentPreviewService.resolveDocumentPreview(document);
    const fileStats = await fs.promises.stat(preview.filePath).catch(() => null);
    if (!fileStats || !fileStats.isFile()) {
      return res.status(404).json({
        success: false,
        message: '预览文件不存在'
      });
    }

    res.setHeader('Content-Type', preview.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', String(fileStats.size));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeContentDispositionFilename(preview.fileName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');

    const stream = fs.createReadStream(preview.filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: '读取预览文件失败'
        });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
    return undefined;
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);
    return res.status(statusCode).json({
      success: false,
      message: error.message || '在线预览失败'
    });
  }
};

const listProjectRuns = (req, res) => {
  try {
    const runs = projectService.listRuns(req.sessionId, req.params.projectId, req.query || {});
    return res.json({
      success: true,
      runs
    });
  } catch (error) {
    const statusCode = error.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '获取处理历史失败'
    });
  }
};

const listProjectAssets = (req, res) => {
  try {
    const assets = projectService.listAssets(req.sessionId, req.params.projectId, req.query || {});
    return res.json({
      success: true,
      assets
    });
  } catch (error) {
    const statusCode = error.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '获取素材列表失败'
    });
  }
};

const updateProjectAssetOcr = (req, res) => {
  try {
    const asset = projectService.updateAssetOcr(
      req.sessionId,
      req.params.projectId,
      req.params.assetId,
      {
        ocrText: req.body?.ocrText || '',
        ocrIndexed: Object.prototype.hasOwnProperty.call(req.body || {}, 'ocrIndexed')
          ? Boolean(req.body.ocrIndexed)
          : true
      }
    );

    return res.json({
      success: true,
      asset
    });
  } catch (error) {
    const statusCode = ['PROJECT_NOT_FOUND', 'ASSET_NOT_FOUND'].includes(error.code) ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '更新素材 OCR 失败'
    });
  }
};

const listProjectBatches = (req, res) => {
  try {
    const batches = projectService.listBatchJobs(req.sessionId, req.params.projectId, req.query || {});
    return res.json({
      success: true,
      batches
    });
  } catch (error) {
    const statusCode = error.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '获取批量任务失败'
    });
  }
};

const listBatchItems = (req, res) => {
  try {
    const items = projectService.listBatchItems(
      req.sessionId,
      req.params.projectId,
      req.params.batchId,
      req.query || {}
    );
    return res.json({
      success: true,
      items
    });
  } catch (error) {
    const statusCode = (error.code === 'PROJECT_NOT_FOUND' || error.code === 'BATCH_NOT_FOUND') ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '获取批量子任务失败'
    });
  }
};

const listProjectAudit = (req, res) => {
  try {
    const events = projectService.listAuditEvents(req.sessionId, req.params.projectId, req.query || {});
    return res.json({
      success: true,
      events
    });
  } catch (error) {
    const statusCode = error.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || '获取审计日志失败'
    });
  }
};

module.exports = {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  listProjectDocuments,
  previewProjectDocument,
  listProjectRuns,
  listProjectAssets,
  updateProjectAssetOcr,
  listProjectBatches,
  listBatchItems,
  listProjectAudit
};
