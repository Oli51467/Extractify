const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const uuid = require('uuid').v4;
const { createCanvas } = require('canvas');
const config = require('../config');

// 为 pdf.js 添加 Node.js 兼容性
global.DOMMatrix = class DOMMatrix {
  constructor(transform) {
    if (transform) {
      this.a = transform[0];
      this.b = transform[1];
      this.c = transform[2];
      this.d = transform[3];
      this.e = transform[4];
      this.f = transform[5];
    } else {
      this.a = this.d = 1;
      this.b = this.c = this.e = this.f = 0;
    }
  }
};

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const workerCandidates = [
  path.join(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.js'),
  path.join(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.js')
];
for (const workerPath of workerCandidates) {
  if (fs.existsSync(workerPath)) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
    break;
  }
}

const SOFFICE_CANDIDATES = [
  config.tools.sofficePath,
  process.env.SOFFICE_PATH,
  '/opt/homebrew/bin/soffice',
  '/usr/bin/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  'soffice'
].filter(Boolean);

const clampProgress = (value) => {
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num);
};

const reportProgress = (onProgress, patch = {}) => {
  if (typeof onProgress !== 'function') return;
  const nextPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'progress')) {
    nextPatch.progress = clampProgress(nextPatch.progress);
  }
  onProgress(nextPatch);
};

const createStageReporter = (onProgress, base, span) => {
  return (stageProgress, message) => {
    reportProgress(onProgress, {
      status: 'processing',
      progress: base + Math.round((clampProgress(stageProgress) / 100) * span),
      message
    });
  };
};

const toPublicUploadPath = (absolutePath) => {
  const relativePath = path.relative(config.paths.uploadRoot, absolutePath);
  const normalized = relativePath.split(path.sep).join('/');
  return `/uploads/${normalized}`;
};

// 提取文档中的图片
exports.extractImages = async (inputFilePath, outputDir, options = {}) => {
  const onProgress = options.onProgress;
  const tempDir = path.join(config.paths.tempRoot, uuid());

  try {
    await fs.promises.mkdir(tempDir, { recursive: true });
    await fs.promises.mkdir(outputDir, { recursive: true });

    reportProgress(onProgress, {
      status: 'processing',
      progress: 25,
      message: '正在准备解析文档...'
    });

    let sourcePath = inputFilePath;
    const originalExt = path.extname(inputFilePath).toLowerCase();

    if (originalExt === '.doc') {
      const convertReporter = createStageReporter(onProgress, 25, 10);
      sourcePath = await convertDocToDocx(inputFilePath, tempDir, convertReporter);
    }

    const fileExt = path.extname(sourcePath).toLowerCase();
    let images = [];

    if (fileExt === '.pdf') {
      const extractReporter = createStageReporter(onProgress, 35, 50);
      images = await extractImagesFromPdf(sourcePath, outputDir, extractReporter);
    } else {
      const extractReporter = createStageReporter(onProgress, 35, 50);
      images = await extractImagesFromDocx(sourcePath, outputDir, extractReporter);
    }

    if (images.length === 0) {
      reportProgress(onProgress, {
        status: 'processing',
        progress: 98,
        message: '文档中未检测到可提取图片'
      });
      return { images: [], zipPath: '' };
    }

    reportProgress(onProgress, {
      status: 'processing',
      progress: 90,
      message: '正在打包图片...'
    });

    const zipOutputPath = path.join(outputDir, 'images.zip');
    const outputZip = new AdmZip();

    images.forEach((image) => {
      const imagePath = path.join(outputDir, image.name);
      if (fs.existsSync(imagePath)) {
        outputZip.addLocalFile(imagePath);
      }
    });

    outputZip.writeZip(zipOutputPath);

    reportProgress(onProgress, {
      status: 'processing',
      progress: 98,
      message: '图片打包完成，准备返回结果...'
    });

    return {
      images,
      zipPath: toPublicUploadPath(zipOutputPath)
    };
  } catch (error) {
    console.error('提取图片错误:', error);
    throw error;
  } finally {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('清理临时目录失败:', cleanupError);
    }
  }
};

async function convertDocToDocx(docPath, tempDir, reportStageProgress) {
  reportStageProgress(5, '检测 .doc 转换环境...');

  const sofficeBinary = resolveSofficeBinary();
  if (!sofficeBinary) {
    throw new Error('当前环境未安装 LibreOffice（soffice），无法处理 .doc 文件。请安装 LibreOffice 后重试。');
  }

  const outputDir = path.join(tempDir, 'doc_convert');
  await fs.promises.mkdir(outputDir, { recursive: true });

  reportStageProgress(20, '正在将 .doc 转换为 .docx...');

  try {
    await runCommand(
      sofficeBinary,
      ['--headless', '--convert-to', 'docx', '--outdir', outputDir, docPath],
      { timeoutMs: 2 * 60 * 1000 }
    );
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error('未找到 LibreOffice 可执行文件（soffice），请设置 SOFFICE_PATH 或安装 LibreOffice。');
    }
    throw error;
  }

  const expectedName = `${path.basename(docPath, path.extname(docPath))}.docx`;
  const expectedPath = path.join(outputDir, expectedName);

  let convertedPath = expectedPath;
  if (!fs.existsSync(expectedPath)) {
    const files = await fs.promises.readdir(outputDir);
    const fallbackName = files.find(file => file.toLowerCase().endsWith('.docx'));
    if (!fallbackName) {
      throw new Error('.doc 转换失败，未找到转换后的 .docx 文件');
    }
    convertedPath = path.join(outputDir, fallbackName);
  }

  reportStageProgress(100, '.doc 转换成功');
  return convertedPath;
}

function resolveSofficeBinary() {
  for (const candidate of SOFFICE_CANDIDATES) {
    const trimmed = String(candidate || '').trim();
    if (!trimmed) continue;

    if (trimmed.includes('/') || trimmed.includes(path.sep)) {
      if (fs.existsSync(trimmed)) return trimmed;
      continue;
    }

    return trimmed;
  }

  return '';
}

function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs || 60 * 1000;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    const timeoutId = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`命令执行超时: ${command} ${args.join(' ')}`));
    }, timeoutMs);

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code === 0) {
        resolve();
        return;
      }

      const details = stderr.trim();
      reject(new Error(details || `${command} 执行失败，退出码: ${code}`));
    });
  });
}

// 从Word文档中提取图片
async function extractImagesFromDocx(docxPath, outputDir, reportStageProgress) {
  const images = [];
  const tempDir = path.join(path.dirname(outputDir), `temp_${uuid()}`);

  try {
    await fs.promises.mkdir(tempDir, { recursive: true });
    reportStageProgress(5, '正在解压 Word 文档...');

    const zip = new AdmZip(docxPath);
    zip.extractAllTo(tempDir, true);

    const mediaDir = path.join(tempDir, 'word', 'media');
    if (!fs.existsSync(mediaDir)) {
      reportStageProgress(100, 'Word 文档中未找到媒体资源');
      return [];
    }

    const files = await fs.promises.readdir(mediaDir);
    const mediaFiles = [];

    for (const file of files) {
      const filePath = path.join(mediaDir, file);
      const stats = await fs.promises.stat(filePath);
      if (stats.isFile()) {
        mediaFiles.push({ file, filePath, stats });
      }
    }

    if (mediaFiles.length === 0) {
      reportStageProgress(100, 'Word 文档中未找到可提取图片');
      return [];
    }

    const pageNum = 1;
    for (let index = 0; index < mediaFiles.length; index++) {
      const item = mediaFiles[index];
      const ext = path.extname(item.file).replace('.', '').toLowerCase() || 'bin';
      const imageIndex = index + 1;
      const fileName = `image_${pageNum}_${imageIndex}_${Date.now()}.${ext}`;
      const outputPath = path.join(outputDir, fileName);

      await fs.promises.copyFile(item.filePath, outputPath);

      images.push({
        id: imageIndex,
        name: fileName,
        path: toPublicUploadPath(outputPath),
        size: item.stats.size,
        width: null,
        height: null,
        page: pageNum
      });

      const stage = Math.round((imageIndex / mediaFiles.length) * 100);
      reportStageProgress(stage, `正在提取 Word 图片 (${imageIndex}/${mediaFiles.length})`);
    }

    return images;
  } catch (error) {
    console.error('从Word文档提取图片失败:', error);
    return [];
  } finally {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('清理Word临时目录失败:', cleanupError);
    }
  }
}

// 从PDF文件中提取图片
async function extractImagesFromPdf(pdfPath, outputDir, reportStageProgress) {
  try {
    const images = [];
    const dataBuffer = await fs.promises.readFile(pdfPath);
    const uint8Array = new Uint8Array(dataBuffer);

    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      disableFontFace: true,
      ignoreErrors: true
    });

    const pdfDocument = await loadingTask.promise;
    const totalPages = pdfDocument.numPages;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        const page = await pdfDocument.getPage(pageNum);
        const opList = await page.getOperatorList();

        const imageRefSet = new Set();
        for (let i = 0; i < opList.fnArray.length; i++) {
          if (opList.fnArray[i] === pdfjsLib.OPS.paintImageXObject) {
            imageRefSet.add(opList.argsArray[i][0]);
          }
        }

        for (const imageRef of imageRefSet) {
          try {
            const imgObj = await getImageObject(page, imageRef);
            if (!imgObj || !imgObj.data || !imgObj.width || !imgObj.height) {
              continue;
            }

            const imageIndex = images.length + 1;
            const fileName = `image_${pageNum}_${imageIndex}_${Date.now()}.png`;
            const outputPath = path.join(outputDir, fileName);
            const imageData = processImageData(imgObj);

            await fs.promises.writeFile(outputPath, imageData);
            const stats = await fs.promises.stat(outputPath);

            images.push({
              id: imageIndex,
              name: fileName,
              path: toPublicUploadPath(outputPath),
              size: stats.size,
              width: imgObj.width,
              height: imgObj.height,
              page: pageNum
            });
          } catch (imgError) {
            console.error(`处理图像 ${imageRef} 时出错:`, imgError);
          }
        }

        const stage = Math.round((pageNum / totalPages) * 100);
        reportStageProgress(stage, `正在解析 PDF 页面 (${pageNum}/${totalPages})`);

        page.cleanup();
      } catch (pageError) {
        console.error(`处理页面 ${pageNum} 时出错:`, pageError);
      }
    }

    if (images.length === 0) {
      reportStageProgress(70, '未发现嵌入图片，正在尝试页面渲染提取...');
      return await renderPdfPagesToImages(pdfPath, outputDir, reportStageProgress);
    }

    return images;
  } catch (error) {
    console.error('从PDF提取图片错误:', error);
    try {
      return await extractImagesFromPdfFallback(pdfPath, outputDir, reportStageProgress);
    } catch (fallbackError) {
      console.error('PDF备用提取方法失败:', fallbackError);
      return [];
    }
  }
}

// 使用 Canvas 处理图像像素
function processImageData(imgObj) {
  const canvas = createCanvas(imgObj.width, imgObj.height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(imgObj.width, imgObj.height);
  const data = imageData.data;
  const imgData = imgObj.data;

  if (imgObj.kind === 'RGB' || imgData.length === imgObj.width * imgObj.height * 3) {
    let k = 0;
    for (let i = 0; i < imgData.length; i += 3) {
      data[k] = imgData[i];
      data[k + 1] = imgData[i + 1];
      data[k + 2] = imgData[i + 2];
      data[k + 3] = 255;
      k += 4;
    }
  } else if (imgObj.kind === 'RGBA' || imgData.length === imgObj.width * imgObj.height * 4) {
    for (let i = 0; i < imgData.length; i++) {
      data[i] = imgData[i];
    }
  } else {
    let k = 0;
    for (let i = 0; i < imgData.length; i++) {
      data[k] = imgData[i];
      data[k + 1] = imgData[i];
      data[k + 2] = imgData[i];
      data[k + 3] = 255;
      k += 4;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer('image/png');
}

// 等待 pdf.js 页面对象解析图像数据
function getImageObject(page, imageRef) {
  if (page.objs.has(imageRef)) {
    return Promise.resolve(page.objs.get(imageRef));
  }

  return new Promise((resolve, reject) => {
    let timeoutId;

    try {
      timeoutId = setTimeout(() => {
        resolve(null);
      }, 5000);

      page.objs.get(imageRef, (data) => {
        clearTimeout(timeoutId);
        resolve(data);
      });
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

// 渲染 PDF 页面为图片（兜底）
async function renderPdfPagesToImages(pdfPath, outputDir, reportStageProgress) {
  try {
    const images = [];
    const dataBuffer = await fs.promises.readFile(pdfPath);
    const uint8Array = new Uint8Array(dataBuffer);

    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      disableFontFace: true,
      ignoreErrors: true
    });

    const pdfDocument = await loadingTask.promise;
    const totalPages = pdfDocument.numPages;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        await page.render({ canvasContext: context, viewport }).promise;

        const fileName = `page_${pageNum}_${Date.now()}.png`;
        const outputPath = path.join(outputDir, fileName);
        const buffer = canvas.toBuffer('image/png');

        await fs.promises.writeFile(outputPath, buffer);
        const stats = await fs.promises.stat(outputPath);

        images.push({
          id: pageNum,
          name: fileName,
          path: toPublicUploadPath(outputPath),
          size: stats.size,
          width: viewport.width,
          height: viewport.height,
          page: pageNum
        });

        const stage = Math.round((pageNum / totalPages) * 100);
        reportStageProgress(stage, `正在渲染 PDF 页面 (${pageNum}/${totalPages})`);

        page.cleanup();
      } catch (pageError) {
        console.error(`渲染页面 ${pageNum} 时出错:`, pageError);
      }
    }

    return images;
  } catch (error) {
    console.error('渲染PDF页面为图像失败:', error);
    return [];
  }
}

// 备用方法：渲染页面兜底
async function extractImagesFromPdfFallback(pdfPath, outputDir, reportStageProgress) {
  return renderPdfPagesToImages(pdfPath, outputDir, reportStageProgress);
}
