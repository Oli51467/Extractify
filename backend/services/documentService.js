const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const uuid = require('uuid').v4;
const { createCanvas, loadImage } = require('canvas');
const config = require('../config');
const { normalizeUploadedFilename } = require('../utils/filename');

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

const standardFontDirCandidates = [
  path.join(__dirname, '../node_modules/pdfjs-dist/standard_fonts'),
  path.join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts')
];
const standardFontDir = standardFontDirCandidates.find((dirPath) => fs.existsSync(dirPath)) || '';

const buildPdfDocumentOptions = (uint8Array) => {
  const options = {
    data: uint8Array,
    disableFontFace: true,
    ignoreErrors: true
  };

  if (standardFontDir) {
    options.standardFontDataUrl = `${standardFontDir}${path.sep}`;
  }

  return options;
};

const SOFFICE_CANDIDATES = [
  config.tools.sofficePath,
  process.env.SOFFICE_PATH,
  '/opt/homebrew/bin/soffice',
  '/usr/bin/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  'soffice'
].filter(Boolean);

const TESSERACT_CANDIDATES = [
  config.tools.tesseractPath,
  process.env.TESSERACT_PATH,
  '/opt/homebrew/bin/tesseract',
  '/usr/local/bin/tesseract',
  '/usr/bin/tesseract',
  'tesseract'
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

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;

// 提取文档中的图片
exports.extractImages = async (inputFilePath, outputDir, options = {}) => {
  const onProgress = options.onProgress;
  const dedupeEnabled = typeof options.enableDedupe === 'boolean'
    ? options.enableDedupe
    : config.processing.imageDedupeEnabled;
  const autoOcrEnabled = typeof options.enableOcr === 'boolean'
    ? options.enableOcr
    : config.processing.autoOcrEnabled;
  const autoNamingEnabled = typeof options.enableAutoNaming === 'boolean'
    ? options.enableAutoNaming
    : config.processing.autoNamingEnabled;
  const sourceName = normalizeUploadedFilename(options.sourceName, path.basename(inputFilePath, path.extname(inputFilePath)));
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

    let dedupeSummary = {
      enabled: dedupeEnabled,
      originalCount: images.length,
      keptCount: images.length,
      dedupedCount: 0
    };

    let namingSummary = {
      enabled: autoNamingEnabled,
      renamedCount: 0
    };

    let ocrSummary = {
      enabled: autoOcrEnabled,
      engineAvailable: false,
      processedCount: 0,
      indexedCount: 0,
      failedCount: 0
    };

    if (images.length === 0) {
      reportProgress(onProgress, {
        status: 'processing',
        progress: 98,
        message: '文档中未检测到可提取图片'
      });
      return {
        images: [],
        zipPath: '',
        zipAbsolutePath: '',
        dedupe: dedupeSummary,
        naming: namingSummary,
        ocr: ocrSummary
      };
    }

    if (dedupeEnabled && images.length > 1) {
      const dedupeReporter = createStageReporter(onProgress, 85, 5);
      const dedupeResult = await dedupeSimilarImages(images, outputDir, dedupeReporter, {
        hammingThreshold: config.processing.imageDedupeHammingThreshold,
        aspectTolerance: config.processing.imageDedupeAspectTolerance
      });

      images = dedupeResult.images;
      dedupeSummary = {
        ...dedupeResult.summary,
        enabled: true
      };
    } else {
      reportProgress(onProgress, {
        status: 'processing',
        progress: 88,
        message: dedupeEnabled ? '图片数量较少，已跳过去重' : '已跳过智能去重'
      });
    }

    if (autoNamingEnabled) {
      const namingReporter = createStageReporter(onProgress, 90, 3);
      const namingResult = await applyAutoNaming(images, outputDir, sourceName, namingReporter);
      images = namingResult.images;
      namingSummary = {
        enabled: true,
        renamedCount: namingResult.renamedCount
      };
    } else {
      reportProgress(onProgress, {
        status: 'processing',
        progress: 92,
        message: '已跳过智能命名'
      });
    }

    if (autoOcrEnabled) {
      const ocrReporter = createStageReporter(onProgress, 93, 3);
      ocrSummary = await buildImageOcrIndex(images, outputDir, ocrReporter);
    } else {
      reportProgress(onProgress, {
        status: 'processing',
        progress: 96,
        message: '已跳过 OCR 建索引'
      });
    }

    reportProgress(onProgress, {
      status: 'processing',
      progress: 96,
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

    const manifest = {
      sourceName,
      generatedAt: new Date().toISOString(),
      imageCount: images.length,
      dedupe: dedupeSummary,
      naming: namingSummary,
      ocr: ocrSummary,
      images: images.map((image) => ({
        name: image.name,
        page: image.page,
        width: image.width,
        height: image.height,
        size: image.size,
        ocrText: image.ocrText || ''
      }))
    };
    outputZip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

    outputZip.writeZip(zipOutputPath);

    reportProgress(onProgress, {
      status: 'processing',
      progress: 98,
      message: '图片打包完成，准备返回结果...'
    });

    return {
      images,
      zipPath: toPublicUploadPath(zipOutputPath),
      zipAbsolutePath: zipOutputPath,
      dedupe: dedupeSummary,
      naming: namingSummary,
      ocr: ocrSummary
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

const toFileSafeToken = (value, fallback = 'image') => {
  const normalized = normalizeUploadedFilename(value, fallback)
    .replace(/\.[^.]+$/, '')
    .replace(/[\s]+/g, '_')
    .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return normalized || fallback;
};

const nextUniqueFileName = async (outputDir, preferredName, oldName, usedNames) => {
  const ext = path.extname(preferredName);
  const stem = path.basename(preferredName, ext) || 'image';
  let candidate = preferredName;
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${stem}_${index}${ext}`;
    index += 1;
  }

  while (candidate !== oldName) {
    const candidatePath = path.join(outputDir, candidate);
    try {
      await fs.promises.access(candidatePath, fs.constants.F_OK);
      candidate = `${stem}_${index}${ext}`;
      index += 1;
    } catch (error) {
      break;
    }
  }

  usedNames.add(candidate);
  return candidate;
};

async function applyAutoNaming(images, outputDir, sourceName, reportStageProgress) {
  const safeSource = toFileSafeToken(sourceName, 'image');
  const pageCounters = new Map();
  const usedNames = new Set();
  let renamedCount = 0;

  reportStageProgress(8, '正在智能命名图片...');

  const renamedImages = [];
  for (let index = 0; index < images.length; index++) {
    const image = images[index];
    const oldName = String(image.name || '').trim();
    const oldPath = path.join(outputDir, oldName);
    const rawExt = path.extname(oldName).toLowerCase();
    const ext = rawExt || '.png';
    const page = Number.isFinite(Number(image.page)) ? Number(image.page) : 1;
    const pageCounter = (pageCounters.get(page) || 0) + 1;
    pageCounters.set(page, pageCounter);

    const preferredName = `${safeSource}_p${String(page).padStart(3, '0')}_${String(pageCounter).padStart(3, '0')}${ext}`;
    const nextName = await nextUniqueFileName(outputDir, preferredName, oldName, usedNames);

    if (oldName && nextName !== oldName && fs.existsSync(oldPath)) {
      const nextPath = path.join(outputDir, nextName);
      await fs.promises.rename(oldPath, nextPath);
      renamedCount += 1;
    }

    const finalPath = path.join(outputDir, nextName);
    let fileSize = Number(image.size || 0);
    try {
      const stats = await fs.promises.stat(finalPath);
      fileSize = stats.size;
    } catch (error) {
      // ignore
    }

    renamedImages.push({
      ...image,
      id: index + 1,
      name: nextName,
      path: toPublicUploadPath(finalPath),
      size: fileSize
    });

    const stage = Math.round(((index + 1) / images.length) * 100);
    reportStageProgress(stage, `正在智能命名 (${index + 1}/${images.length})`);
  }

  reportStageProgress(100, renamedCount > 0 ? `命名完成，已优化 ${renamedCount} 个文件名` : '命名完成，无需调整');
  return {
    images: renamedImages,
    renamedCount
  };
}

function resolveTesseractBinary() {
  for (const candidate of TESSERACT_CANDIDATES) {
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

const recognizeImageText = (binaryPath, filePath, lang, timeoutMs = 30 * 1000) => new Promise((resolve, reject) => {
  const args = [filePath, 'stdout'];
  if (lang) {
    args.push('-l', lang);
  }
  args.push('--psm', '6');

  const child = spawn(binaryPath, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  const timeoutId = setTimeout(() => {
    child.kill('SIGKILL');
    reject(new Error('OCR 识别超时'));
  }, timeoutMs);

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk || '');
  });

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
      resolve(stdout);
      return;
    }

    reject(new Error(stderr.trim() || `tesseract 退出码: ${code}`));
  });
});

const normalizeOcrText = (value) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim();

async function buildImageOcrIndex(images, outputDir, reportStageProgress) {
  const binary = resolveTesseractBinary();
  if (!binary) {
    reportStageProgress(100, '未检测到 OCR 引擎（tesseract），已跳过自动 OCR');
    return {
      enabled: true,
      engineAvailable: false,
      processedCount: images.length,
      indexedCount: 0,
      failedCount: 0
    };
  }

  let indexedCount = 0;
  let failedCount = 0;
  reportStageProgress(5, '正在建立 OCR 索引...');

  for (let index = 0; index < images.length; index++) {
    const image = images[index];
    const filePath = path.join(outputDir, image.name);
    let text = '';

    try {
      text = normalizeOcrText(await recognizeImageText(binary, filePath, 'chi_sim+eng'));
    } catch (primaryError) {
      try {
        text = normalizeOcrText(await recognizeImageText(binary, filePath, 'eng'));
      } catch (fallbackError) {
        failedCount += 1;
      }
    }

    if (text) indexedCount += 1;
    image.ocrText = text;

    const stage = Math.round(((index + 1) / images.length) * 100);
    reportStageProgress(stage, `正在 OCR 识别 (${index + 1}/${images.length})`);
  }

  reportStageProgress(
    100,
    indexedCount > 0
      ? `OCR 索引完成：${indexedCount}/${images.length} 张可检索`
      : 'OCR 索引完成，未识别到可检索文本'
  );

  return {
    enabled: true,
    engineAvailable: true,
    processedCount: images.length,
    indexedCount,
    failedCount
  };
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

const toSafeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const getPixelCount = (width, height) => {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 0;
  return Math.max(0, Math.floor(width) * Math.floor(height));
};

const getAspectRatio = (width, height) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || height === 0) return null;
  return width / height;
};

const isAspectRatioClose = (ratioA, ratioB, tolerance) => {
  if (!Number.isFinite(ratioA) || !Number.isFinite(ratioB)) return true;
  return Math.abs(ratioA - ratioB) <= tolerance;
};

const hammingDistance = (hashA, hashB) => {
  if (!hashA || !hashB || hashA.length !== hashB.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let index = 0; index < hashA.length; index++) {
    if (hashA[index] !== hashB[index]) distance += 1;
  }
  return distance;
};

const createDifferenceHash = async (buffer) => {
  const image = await loadImage(buffer);
  const width = toSafeNumber(image.width);
  const height = toSafeNumber(image.height);

  if (!width || !height) {
    return {
      hash: '',
      width: null,
      height: null
    };
  }

  const canvas = createCanvas(HASH_WIDTH, HASH_HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, HASH_WIDTH, HASH_HEIGHT);
  ctx.drawImage(image, 0, 0, HASH_WIDTH, HASH_HEIGHT);

  const { data } = ctx.getImageData(0, 0, HASH_WIDTH, HASH_HEIGHT);
  let hash = '';

  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_WIDTH - 1; x++) {
      const idx = (y * HASH_WIDTH + x) * 4;
      const rightIdx = (y * HASH_WIDTH + x + 1) * 4;

      const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      const rightGray = data[rightIdx] * 0.299 + data[rightIdx + 1] * 0.587 + data[rightIdx + 2] * 0.114;

      hash += gray >= rightGray ? '1' : '0';
    }
  }

  return {
    hash,
    width,
    height
  };
};

const shouldPreferCandidate = (candidate, current) => {
  const candidatePixels = getPixelCount(candidate.width, candidate.height);
  const currentPixels = getPixelCount(current.width, current.height);

  if (candidatePixels !== currentPixels) {
    return candidatePixels > currentPixels;
  }

  return candidate.byteSize > current.byteSize;
};

const findMatchedRecordIndex = (records, candidate, hammingThreshold, aspectTolerance) => {
  if (candidate.exactHash) {
    const exactIndex = records.findIndex((record) => record.exactHash && record.exactHash === candidate.exactHash);
    if (exactIndex >= 0) return exactIndex;
  }

  if (!candidate.diffHash) return -1;

  let targetIndex = -1;
  let bestDistance = Number.MAX_SAFE_INTEGER;

  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record.diffHash) continue;
    if (!isAspectRatioClose(record.aspectRatio, candidate.aspectRatio, aspectTolerance)) continue;

    const distance = hammingDistance(record.diffHash, candidate.diffHash);
    if (distance > hammingThreshold) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      targetIndex = index;
    }
  }

  return targetIndex;
};

const buildImageRecord = async (image, outputDir) => {
  const filePath = path.join(outputDir, image.name);
  const fileBuffer = await fs.promises.readFile(filePath);
  const stats = await fs.promises.stat(filePath);
  const exactHash = crypto.createHash('sha1').update(fileBuffer).digest('hex');

  let diffHash = '';
  let width = toSafeNumber(image.width);
  let height = toSafeNumber(image.height);

  try {
    const hashResult = await createDifferenceHash(fileBuffer);
    diffHash = hashResult.hash;
    width = hashResult.width || width;
    height = hashResult.height || height;
  } catch (error) {
    // 部分格式（如 emf）无法解码时保留原图，不参与相似去重
  }

  return {
    image,
    filePath,
    byteSize: stats.size,
    exactHash,
    diffHash,
    width,
    height,
    aspectRatio: getAspectRatio(width, height)
  };
};

async function dedupeSimilarImages(images, outputDir, reportStageProgress, options = {}) {
  const hammingThreshold = Number.isFinite(Number(options.hammingThreshold))
    ? Number(options.hammingThreshold)
    : 6;
  const aspectTolerance = Number.isFinite(Number(options.aspectTolerance))
    ? Number(options.aspectTolerance)
    : 0.03;

  reportStageProgress(5, '正在分析图片相似度...');

  const uniqueRecords = [];
  const duplicateRecords = [];

  for (let index = 0; index < images.length; index++) {
    const image = images[index];
    try {
      const record = await buildImageRecord(image, outputDir);
      const matchedIndex = findMatchedRecordIndex(uniqueRecords, record, hammingThreshold, aspectTolerance);

      if (matchedIndex < 0) {
        uniqueRecords.push(record);
      } else if (shouldPreferCandidate(record, uniqueRecords[matchedIndex])) {
        duplicateRecords.push(uniqueRecords[matchedIndex]);
        uniqueRecords[matchedIndex] = record;
      } else {
        duplicateRecords.push(record);
      }
    } catch (error) {
      console.error(`去重分析失败，跳过文件 ${image?.name}:`, error);
      uniqueRecords.push({
        image,
        filePath: path.join(outputDir, image.name),
        byteSize: Number(image.size) || 0,
        exactHash: '',
        diffHash: '',
        width: toSafeNumber(image.width),
        height: toSafeNumber(image.height),
        aspectRatio: getAspectRatio(toSafeNumber(image.width), toSafeNumber(image.height))
      });
    }

    const stage = Math.round(((index + 1) / images.length) * 85);
    reportStageProgress(stage, `正在智能去重 (${index + 1}/${images.length})`);
  }

  const keepSet = new Set(uniqueRecords.map((record) => record.filePath));
  let removedCount = 0;

  for (const record of duplicateRecords) {
    if (!record.filePath || keepSet.has(record.filePath)) continue;
    try {
      await fs.promises.rm(record.filePath, { force: true });
      removedCount += 1;
    } catch (error) {
      console.error(`删除重复图片失败: ${record.filePath}`, error);
    }
  }

  const dedupedImages = uniqueRecords.map((record, index) => ({
    ...record.image,
    id: index + 1,
    size: Number(record.byteSize) || Number(record.image.size) || 0,
    width: record.width || record.image.width || null,
    height: record.height || record.image.height || null
  }));

  if (removedCount > 0) {
    reportStageProgress(100, `智能去重完成，已去重 ${removedCount} 张，保留最高分辨率原图`);
  } else {
    reportStageProgress(100, '智能去重完成，未发现重复图片');
  }

  return {
    images: dedupedImages,
    summary: {
      originalCount: images.length,
      keptCount: dedupedImages.length,
      dedupedCount: removedCount
    }
  };
}

// 从PDF文件中提取图片
async function extractImagesFromPdf(pdfPath, outputDir, reportStageProgress) {
  try {
    const images = [];
    const dataBuffer = await fs.promises.readFile(pdfPath);
    const uint8Array = new Uint8Array(dataBuffer);

    const loadingTask = pdfjsLib.getDocument(buildPdfDocumentOptions(uint8Array));

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

    const loadingTask = pdfjsLib.getDocument(buildPdfDocumentOptions(uint8Array));

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
