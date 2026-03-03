const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const apiRoutes = require('./routes/api');
const config = require('./config');
const jobService = require('./services/jobService');
const { getDb } = require('./services/dbService');
const createSessionMiddleware = require('./middleware/sessionMiddleware');
const uploadAuthMiddleware = require('./middleware/uploadAuthMiddleware');

// 创建 Express 应用
const app = express();
const PORT = config.server.port;

const originMatchesRule = (origin, rule) => {
  if (!origin || !rule) return false;
  if (rule === '*') return true;
  if (rule === origin) return true;

  if (rule.endsWith(':*')) {
    const prefix = rule.slice(0, -1);
    return origin.startsWith(prefix);
  }

  return false;
};

// 确保运行时目录存在
config.ensureRuntimeDirs();
getDb();
app.disable('x-powered-by');

if (config.security.trustProxy) {
  app.set('trust proxy', 1);
}

// 中间件
if (config.security.useHelmet) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = config.cors.origins.some((rule) => originMatchesRule(origin, rule));
    if (allowed) {
      return callback(null, true);
    }
    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
  exposedHeaders: config.cors.exposedHeaders
}));
app.use(createSessionMiddleware(config));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件服务
app.use('/uploads', uploadAuthMiddleware, express.static(config.paths.uploadRoot, {
  dotfiles: 'deny',
  fallthrough: false,
  index: false,
  maxAge: '1h'
}));

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

// 定期清理过期任务目录和任务元数据
const cleanupTimer = setInterval(() => {
  jobService.cleanupExpiredJobs().catch((error) => {
    console.error('清理过期任务失败:', error);
  });
}, config.jobs.cleanupIntervalMs);
cleanupTimer.unref();
jobService.cleanupExpiredJobs().catch((error) => {
  console.error('启动时清理过期任务失败:', error);
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`CORS 允许来源: ${config.cors.origins.join(', ')}`);
});

// 全局超时设置
server.timeout = config.server.requestTimeoutMs;
