const fs = require('fs');
const shareService = require('../services/shareService');

const toAsciiFilename = (value) => String(value || '')
  .replace(/[^a-zA-Z0-9._-]/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '');

const normalizeAsciiZipName = (value) => {
  const next = toAsciiFilename(value);
  if (!next) return 'DocPix_Images.zip';
  if (next.toLowerCase().endsWith('.zip')) return next;
  return `${next}.zip`;
};

const buildContentDisposition = (fileName) => {
  const rawName = String(fileName || 'DocPix_Images.zip');
  const fallbackName = normalizeAsciiZipName(rawName);
  const encodedName = encodeURIComponent(rawName)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
  return `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
};

const getShareDetail = (req, res) => {
  try {
    const share = shareService.getShareByToken(req.params.token);
    if (!share) {
      return res.status(404).json({
        success: false,
        message: '分享链接不存在或已过期'
      });
    }

    return res.json({
      success: true,
      share: shareService.buildPublicSharePayload(share)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || '获取分享信息失败'
    });
  }
};

const downloadSharedZip = (req, res) => {
  try {
    const share = shareService.getShareWithFileByToken(req.params.token);
    if (!share) {
      return res.status(404).json({
        success: false,
        message: '分享文件不存在或已过期'
      });
    }

    const fileName = shareService.resolveShareFileName(share);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', buildContentDisposition(fileName));
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    const fileStream = fs.createReadStream(share.zipPath);
    fileStream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: '读取分享文件失败'
        });
      }
    });
    fileStream.pipe(res);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || '下载分享文件失败'
    });
  }
};

module.exports = {
  getShareDetail,
  downloadSharedZip
};
