# Extractify - 文档图片提取工具

Extractify是一个简单易用的工具，用于从Word文档和PDF文件中提取图片。它提供了直观的用户界面，让您可以轻松上传文档，查看和下载提取的图片。

## 功能特点

- 支持从Word文档(.docx, .doc)中提取图片
- 支持从PDF文件中提取图片
- 任务级多用户隔离（按 jobId 独立目录，互不覆盖）
- 轻量会话隔离（无登录，按浏览器会话 Cookie 绑定任务访问权限）
- 实时显示上传和后端处理进度（基于真实任务状态）
- 图片预览和搜索功能
- 支持下载单个图片或所有图片的压缩包
- 支持通过 LibreOffice 将 .doc 自动转换为 .docx 后提取
- 响应式设计，适配各种设备

## 技术栈

- **前端**：Vue 3, Element Plus, SCSS
- **后端**：Node.js, Express
- **文档处理**：pdf.js, AdmZip, canvas
- **构建工具**：Vite

## 安装说明

### 前提条件

- Node.js (v14.0.0或更高版本)
- npm或yarn

### 安装步骤

1. 克隆仓库
   ```bash
   git clone https://github.com/yourusername/extractify.git
   cd extractify
   ```

2. （推荐）直接运行 `bash start_all.sh`，脚本会自动检测/安装缺失的前后端依赖，并创建所需目录后启动服务。  
   如需手动安装，可参考下方命令：
   ```bash
   # 后端依赖
   cd backend && npm install
   # 前端依赖
   cd ../frontend && npm install
   # 必要目录
   cd .. && mkdir -p backend/uploads/jobs backend/temp
   ```

## 使用说明

### 开发环境

1. 启动后端服务器（默认端口 13434）
   ```bash
   cd backend
   npm run dev
   ```

2. 在另一个终端窗口启动前端开发服务器（默认端口 18982），已在配置中静默处理 Sass 旧版 API 的警告
   ```bash
   cd frontend
   npm run dev
   ```

3. 打开浏览器访问 `http://localhost:5173`

> 一键启动：在项目根目录执行 `bash start_all.sh` 可同时启动后端（13434）与前端（默认 18982），并尝试自动打开前端页面。

### 生产环境

1. 构建前端
   ```bash
   cd frontend
   npm run build
   ```

2. 启动服务器
   ```bash
   cd ../backend
   npm start
   ```

3. 访问 `http://localhost:13434`

## 使用方法

1. 在主页面上传Word文档或PDF文件
2. 等待文件处理完成
3. 在图片预览区域查看提取的图片
4. 使用搜索框筛选图片
5. 点击单个图片下方的下载按钮下载图片，或使用顶部的"下载"按钮下载所有图片的压缩包
6. 如需清空当前图片，点击右上角的清空按钮

## 部署到Ubuntu服务器

### 1. 准备服务器环境

1. 更新系统包
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

2. 安装Node.js和npm
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
   sudo apt install -y nodejs
   
   # 验证安装
   node -v
   npm -v
   ```

3. 安装Git
   ```bash
   sudo apt install -y git
   ```

4. 安装构建工具和依赖
   ```bash
   sudo apt install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
   ```

### 2. 部署应用

1. 克隆代码仓库
   ```bash
   git clone https://github.com/yourusername/extractify.git
   cd extractify
   ```

2. 安装PM2进程管理器
   ```bash
   sudo npm install -g pm2
   ```

3. 构建前端
   ```bash
   cd frontend
   npm install
   npm run build
   
   # 将构建后的文件复制到后端的public目录
   mkdir -p ../backend/public
   cp -r dist/* ../backend/public/
   ```

4. 配置后端
   ```bash
   cd ../backend
   npm install
   
   # 创建必要的目录
   mkdir -p uploads/jobs
   mkdir -p temp
   
   # 设置目录权限
   chmod -R 755 uploads
   chmod -R 755 temp
   ```

5. 创建环境变量文件
   ```bash
   cat > .env << EOL
   PORT=13434
   NODE_ENV=production
   CORS_ORIGINS=https://your-domain.com
   MAX_FILE_SIZE_MB=50
   USE_HELMET=true
   UPLOAD_ROOT=uploads
   JOBS_ROOT=uploads/jobs
   TEMP_ROOT=temp
   JOB_QUEUE_CONCURRENCY=2
   JOB_RETENTION_HOURS=72
   SESSION_COOKIE_SECURE=true
   SOFFICE_PATH=/usr/bin/soffice
   EOL
   ```

### 3. 使用PM2启动应用

1. 创建PM2配置文件
   ```bash
   cat > ecosystem.config.js << EOL
   module.exports = {
     apps: [{
       name: "extractify",
       script: "server.js",
       env: {
         NODE_ENV: "production",
         PORT: 13434
       },
       instances: "max",
       exec_mode: "cluster",
       watch: false,
       max_memory_restart: "500M"
     }]
   }
   EOL
   ```

2. 启动应用
   ```bash
   pm2 start ecosystem.config.js
   
   # 设置PM2开机自启
   pm2 startup
   pm2 save
   ```

### 4. 配置Nginx反向代理

1. 安装Nginx
   ```bash
   sudo apt install -y nginx
   ```

2. 创建Nginx配置文件
   ```bash
   sudo nano /etc/nginx/sites-available/extractify
   ```

3. 添加以下配置
   ```nginx
   server {
       listen 80;
       server_name your-domain.com www.your-domain.com;
   
       location / {
           proxy_pass http://localhost:13434;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   
       # 增加上传文件大小限制
       client_max_body_size 50M;
   }
   ```

4. 启用站点并重启Nginx
   ```bash
   sudo ln -s /etc/nginx/sites-available/extractify /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

### 5. 配置SSL证书（可选）

1. 安装Certbot
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   ```

2. 获取SSL证书
   ```bash
   sudo certbot --nginx -d your-domain.com -d www.your-domain.com
   ```

3. 设置自动续期
   ```bash
   sudo systemctl status certbot.timer
   ```

### 6. 维护和更新

1. 拉取最新代码
   ```bash
   cd /path/to/extractify
   git pull
   ```

2. 更新依赖并重新构建
   ```bash
   # 更新前端
   cd frontend
   npm install
   npm run build
   cp -r dist/* ../backend/public/
   
   # 更新后端
   cd ../backend
   npm install
   
   # 重启应用
   pm2 restart extractify
   ```

### 7. 日志和监控

1. 查看应用日志
   ```bash
   pm2 logs extractify
   ```

2. 监控应用状态
   ```bash
   pm2 monit
   ```

3. 查看Nginx日志
   ```bash
   sudo tail -f /var/log/nginx/access.log
   sudo tail -f /var/log/nginx/error.log
   ```

## 注意事项

- 上传文件大小限制为50MB
- 支持的文件格式：.docx, .doc, .pdf
- 提取的图片将保存在服务器上3天，之后自动删除

## 许可证

[MIT](LICENSE)
