const path = require('path');
const fs = require('fs');
const documentService = require('../services/documentService');

// 处理上传的文档并提取图片
exports.extractImages = async (req, res) => {
  // 增加超时时间
  req.setTimeout(300000); // 5分钟超时

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '没有上传文件'
      });
    }

    const inputFilePath = req.file.path;
    const fileName = path.basename(inputFilePath, path.extname(inputFilePath));
    const fileExt = path.extname(inputFilePath).toLowerCase();

    // 检查文件类型
    if (!['.docx', '.doc', '.pdf'].includes(fileExt)) {
      return res.status(400).json({
        success: false,
        message: '不支持的文件类型，仅支持 .docx、.doc 和 .pdf 文件'
      });
    }

    // 为每个上传的文件创建单独的目录
    const outputDir = path.join(__dirname, '../uploads/images', fileName + '_' + Date.now());

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 提取图片
    try {
      const result = await documentService.extractImages(inputFilePath, outputDir);

      if (result.images.length === 0) {
        return res.json({
          success: true,
          message: '文档中未找到图片',
          images: [],
          zipUrl: ''
        });
      }

      res.json({
        success: true,
        message: '图片提取成功',
        images: result.images,
        zipUrl: result.zipPath
      });
    } catch (extractError) {
      console.error('图片提取过程错误:', extractError);
      return res.status(500).json({
        success: false,
        message: extractError.message || '图片提取失败',
        error: extractError.toString()
      });
    }
  } catch (error) {
    console.error('图片提取控制器错误:', error);
    res.status(500).json({
      success: false,
      message: '图片提取失败',
      error: error.message
    });
  }
};

// 下载图片压缩包
exports.downloadImages = (req, res) => {
  try {
    const zipFilePath = path.join(__dirname, '../uploads/images/images.zip');

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