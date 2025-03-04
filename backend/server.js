const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const apiRoutes = require('./routes/api');

// 创建 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;

// 确保上传和输出目录存在
const uploadsDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'uploads', 'output');
const previewDir = path.join(__dirname, 'uploads', 'preview');

[uploadsDir, outputDir, previewDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 中间件
app.use(cors({
  origin: 'http://localhost:5173', // 前端开发服务器地址
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'Content-Type'] // 允许前端访问这些响应头
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API 路由
app.use('/api', apiRoutes);

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('全局错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器错误',
    error: err.message
  });
});

// 定期清理旧的图片目录（每天一次）
const cleanupOldFiles = async () => {
  try {
    const imagesDir = path.join(__dirname, 'uploads/images');
    
    // 确保目录存在
    if (!fs.existsSync(imagesDir)) return;
    
    const entries = fs.readdirSync(imagesDir, { withFileTypes: true });
    const now = Date.now();
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(imagesDir, entry.name);
        const stats = fs.statSync(dirPath);
        
        // 删除超过3天的目录
        if (now - stats.birthtimeMs > 3 * 24 * 60 * 60 * 1000) {
          await fs.promises.rm(dirPath, { recursive: true, force: true });
          console.log(`已清理旧目录: ${dirPath}`);
        }
      }
    }
  } catch (error) {
    console.error('清理旧文件失败:', error);
  }
};

// 每天执行一次清理
setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000);

// 启动时也执行一次清理
cleanupOldFiles();

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

// 增加全局超时设置
server.timeout = 300000; // 5分钟 