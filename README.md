# Extractify - 文档图片提取工具

Extractify是一个简单易用的工具，用于从Word文档和PDF文件中提取图片。它提供了直观的用户界面，让您可以轻松上传文档，查看和下载提取的图片。

## 功能特点

- 支持从Word文档(.docx, .doc)中提取图片
- 支持从PDF文件中提取图片
- 实时显示上传和处理进度
- 图片预览和搜索功能
- 支持下载单个图片或所有图片的压缩包
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

2. 安装后端依赖
   ```bash
   cd backend
   npm install
   ```

3. 安装前端依赖
   ```bash
   cd ../frontend
   npm install
   ```

4. 创建必要的目录
   ```bash
   mkdir -p backend/uploads/images
   mkdir -p backend/uploads/output
   mkdir -p backend/uploads/preview
   mkdir -p backend/temp
   ```

## 使用说明

### 开发环境

1. 启动后端服务器
   ```bash
   cd backend
   npm run dev
   ```

2. 在另一个终端窗口启动前端开发服务器
   ```bash
   cd frontend
   npm run dev
   ```

3. 打开浏览器访问 `http://localhost:5173`

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

3. 访问 `http://localhost:3000`

## 使用方法

1. 在主页面上传Word文档或PDF文件
2. 等待文件处理完成
3. 在图片预览区域查看提取的图片
4. 使用搜索框筛选图片
5. 点击单个图片下方的下载按钮下载图片，或使用顶部的"下载"按钮下载所有图片的压缩包
6. 如需清空当前图片，点击右上角的清空按钮

## 注意事项

- 上传文件大小限制为50MB
- 支持的文件格式：.docx, .doc, .pdf
- 提取的图片将保存在服务器上3天，之后自动删除

## 许可证

[MIT](LICENSE)
