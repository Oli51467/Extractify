const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const uuid = require('uuid').v4;
const { PDFDocument } = require('pdf-lib');
const { createCanvas, Image } = require('canvas');

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

// 导入 pdf.js
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// 设置 pdf.js worker 路径
const PDFJS_WORKER_PATH = path.join(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.js');
if (fs.existsSync(PDFJS_WORKER_PATH)) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_PATH;
}

// 提取文档中的图片
exports.extractImages = async (inputFilePath, outputDir) => {
  try {
    // 创建临时目录
    const tempDir = path.join(__dirname, '../temp', uuid());
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 根据文件扩展名判断处理方式
    const fileExt = path.extname(inputFilePath).toLowerCase();
    let images = [];

    if (fileExt === '.pdf') {
      // 处理PDF文件
      console.log('开始处理PDF文件...');
      try {
        images = await extractImagesFromPdf(inputFilePath, outputDir, tempDir);
      } catch (pdfError) {
        console.error('PDF处理失败，尝试备用方法:', pdfError);
        images = await extractImagesFromPdfFallback(inputFilePath, outputDir);
      }
    } else {
      // 处理Word文档
      console.log('开始解压Word文件...');
      images = await extractImagesFromDocx(inputFilePath, outputDir);
    }

    console.log(`成功提取 ${images.length} 张图片，开始创建压缩包...`);

    if (images.length === 0) {
      console.log('未找到任何图片');
      return { images: [], zipPath: '' };
    }

    // 创建图片压缩包
    const zipOutputPath = path.join(outputDir, 'images.zip');
    const outputZip = new AdmZip();

    images.forEach(image => {
      const imagePath = path.join(outputDir, image.name);
      if (fs.existsSync(imagePath)) {
        outputZip.addLocalFile(imagePath);
      }
    });

    outputZip.writeZip(zipOutputPath);
    console.log('压缩包创建完成');

    // 清理临时目录
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      console.log('临时目录清理完成');
    } catch (rmError) {
      console.error('清理临时目录失败:', rmError);
      // 继续执行，不中断流程
    }

    return {
      images,
      zipPath: `/uploads/images/${path.basename(outputDir)}/images.zip`
    };
  } catch (error) {
    console.error('提取图片错误:', error);
    throw error;
  }
};

// 从Word文档中提取图片
async function extractImagesFromDocx(docxPath, outputDir) {
  try {
    console.log('开始从Word文档提取图片...');
    const images = [];

    // 创建临时目录用于解压
    const tempDir = path.join(path.dirname(outputDir), 'temp_' + uuid());
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 解压docx文件（实际上是zip格式）
    const zip = new AdmZip(docxPath);
    zip.extractAllTo(tempDir, true);

    // Word文档中的图片存储在word/media目录下
    const mediaDir = path.join(tempDir, 'word', 'media');

    if (fs.existsSync(mediaDir)) {
      const files = fs.readdirSync(mediaDir);

      // 处理每个图片文件
      for (const file of files) {
        const filePath = path.join(mediaDir, file);
        const stats = fs.statSync(filePath);

        // 只处理文件（不处理目录）
        if (stats.isFile()) {
          // 使用与PDF相同的编号逻辑
          const imageIndex = images.length + 1;

          // 使用与PDF相同的文件命名格式 (image_页码_索引_时间戳.扩展名)
          // 由于Word没有页码概念，使用1作为固定页码
          const pageNum = 1;
          const fileName = `image_${pageNum}_${imageIndex}_${Date.now()}.${path.extname(file).substring(1)}`;
          const outputPath = path.join(outputDir, fileName);

          // 复制图片到输出目录
          fs.copyFileSync(filePath, outputPath);

          // 添加到图片列表
          images.push({
            id: imageIndex,
            name: fileName,
            path: `/uploads/images/${path.basename(outputDir)}/${fileName}`,
            size: stats.size,
            width: null,  // Word图片暂不获取宽高
            height: null,
            page: pageNum  // 添加页码属性，与PDF保持一致
          });

          console.log(`提取了图片: ${fileName} (${stats.size} 字节)`);
        }
      }
    } else {
      console.log('未找到媒体目录，可能没有图片');
    }

    // 清理临时目录
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('清理临时目录失败:', cleanupError);
    }

    console.log(`从Word文档中提取了 ${images.length} 张图片`);
    return images;
  } catch (error) {
    console.error('从Word文档提取图片失败:', error);
    return [];
  }
}

// 从PDF文件中提取图片
async function extractImagesFromPdf(pdfPath, outputDir, tempDir) {
  try {
    console.log('开始从PDF提取图片...');
    const images = [];

    // 读取PDF文件
    const dataBuffer = fs.readFileSync(pdfPath);

    // 将Buffer转换为Uint8Array
    const uint8Array = new Uint8Array(dataBuffer);

    // 使用pdf.js加载PDF
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      disableFontFace: true,
      ignoreErrors: true,
    });

    const pdfDocument = await loadingTask.promise;
    console.log(`PDF有 ${pdfDocument.numPages} 页`);

    // 遍历所有页面
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      try {
        console.log(`处理第 ${pageNum}/${pdfDocument.numPages} 页...`);

        // 获取页面
        const page = await pdfDocument.getPage(pageNum);

        // 获取页面上的操作列表
        const opList = await page.getOperatorList();

        // 查找图像引用
        const imageRefs = [];
        for (let i = 0; i < opList.fnArray.length; i++) {
          if (opList.fnArray[i] === pdfjsLib.OPS.paintImageXObject) {
            const imageRef = opList.argsArray[i][0]; // 图像引用名称
            if (!imageRefs.includes(imageRef)) {
              imageRefs.push(imageRef);
            }
          }
        }

        console.log(`页面 ${pageNum} 中找到 ${imageRefs.length} 个图像引用`);

        // 处理每个图像引用
        for (const imageRef of imageRefs) {
          try {
            // 获取图像对象
            const imgObj = await page.objs.get(imageRef);

            if (imgObj && imgObj.data && imgObj.width && imgObj.height) {
              const imageIndex = images.length + 1;

              // 创建文件名
              const fileName = `image_${pageNum}_${imageIndex}_${Date.now()}.png`;
              const outputPath = path.join(outputDir, fileName);

              try {
                // 直接处理图像数据并保存为PNG
                const imageData = processImageData(imgObj);
                fs.writeFileSync(outputPath, imageData);

                // 获取文件大小
                const stats = fs.statSync(outputPath);

                // 添加到图片列表
                images.push({
                  id: imageIndex,
                  name: fileName,
                  path: `/uploads/images/${path.basename(outputDir)}/${fileName}`,
                  size: stats.size,
                  width: imgObj.width,
                  height: imgObj.height,
                  page: pageNum
                });

                console.log(`从页面 ${pageNum} 提取了图像: ${fileName} (${imgObj.width}x${imgObj.height})`);
              } catch (saveError) {
                console.error(`保存图像失败:`, saveError);
              }
            } else {
              console.log(`图像 ${imageRef} 对象无效或不完整`);
            }
          } catch (imgError) {
            console.error(`处理图像 ${imageRef} 时出错:`, imgError);
          }
        }

        // 释放页面资源
        page.cleanup();
      } catch (pageError) {
        console.error(`处理页面 ${pageNum} 时出错:`, pageError);
      }
    }

    // 如果没有找到图像，尝试渲染页面作为图像
    if (images.length === 0) {
      console.log('未找到嵌入图像，尝试创建页面缩略图...');
      return await renderPdfPagesToImages(pdfPath, outputDir);
    }

    console.log(`从PDF中提取了 ${images.length} 张图片`);
    return images;
  } catch (error) {
    console.error('从PDF提取图片错误:', error);

    // 如果完全失败，尝试使用备用方法
    try {
      console.log('尝试使用备用方法提取图片...');
      return await renderPdfPagesToImages(pdfPath, outputDir);
    } catch (fallbackError) {
      console.error('备用方法也失败:', fallbackError);
      return [];
    }
  }
}

// 处理图像数据 - 使用Canvas正确处理图像数据
function processImageData(imgObj) {
  try {
    // 创建canvas
    const canvas = createCanvas(imgObj.width, imgObj.height);
    const ctx = canvas.getContext('2d');

    // 创建新的ImageData
    const imageData = ctx.createImageData(imgObj.width, imgObj.height);
    const data = imageData.data;

    // 获取原始图像数据
    const imgData = imgObj.data;

    // 根据图像类型处理数据
    if (imgObj.kind === 'RGB' || (imgData.length === imgObj.width * imgObj.height * 3)) {
      // RGB格式 (3通道)
      let k = 0;
      let i = 0;
      while (i < imgData.length) {
        data[k] = imgData[i];       // R
        data[k + 1] = imgData[i + 1]; // G
        data[k + 2] = imgData[i + 2]; // B
        data[k + 3] = 255;            // Alpha (完全不透明)

        i += 3;
        k += 4;
      }
    } else if (imgObj.kind === 'RGBA' || (imgData.length === imgObj.width * imgObj.height * 4)) {
      // RGBA格式 (4通道)
      for (let i = 0; i < imgData.length; i++) {
        data[i] = imgData[i];
      }
    } else {
      // 灰度图像 (1通道)
      let k = 0;
      for (let i = 0; i < imgData.length; i++) {
        data[k] = imgData[i];     // R
        data[k + 1] = imgData[i]; // G
        data[k + 2] = imgData[i]; // B
        data[k + 3] = 255;        // Alpha (完全不透明)
        k += 4;
      }
    }

    // 将处理后的数据放回canvas
    ctx.putImageData(imageData, 0, 0);

    // 转换为PNG Buffer
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('处理图像数据失败:', error);
    throw error;
  }
}

// 渲染PDF页面为图像
async function renderPdfPagesToImages(pdfPath, outputDir) {
  try {
    console.log('渲染PDF页面为图像...');
    const images = [];

    // 读取PDF文件
    const dataBuffer = fs.readFileSync(pdfPath);

    // 将Buffer转换为Uint8Array
    const uint8Array = new Uint8Array(dataBuffer);

    // 使用pdf.js加载PDF
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      disableFontFace: true,
      ignoreErrors: true,
    });

    const pdfDocument = await loadingTask.promise;
    console.log(`PDF有 ${pdfDocument.numPages} 页`);

    // 遍历所有页面
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      try {
        // 获取页面
        const page = await pdfDocument.getPage(pageNum);

        // 获取页面尺寸
        const viewport = page.getViewport({ scale: 1.5 }); // 放大1.5倍以提高清晰度

        // 创建canvas
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        // 渲染页面到canvas
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };

        await page.render(renderContext).promise;

        // 保存canvas为图像
        const fileName = `page_${pageNum}_${Date.now()}.png`;
        const outputPath = path.join(outputDir, fileName);

        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(outputPath, buffer);

        // 获取文件大小
        const stats = fs.statSync(outputPath);

        // 添加到图片列表
        images.push({
          id: pageNum,
          name: fileName,
          path: `/uploads/images/${path.basename(outputDir)}/${fileName}`,
          size: stats.size,
          width: viewport.width,
          height: viewport.height,
          page: pageNum
        });

        console.log(`渲染页面 ${pageNum} 为图像: ${fileName}`);

        // 释放页面资源
        page.cleanup();
      } catch (pageError) {
        console.error(`渲染页面 ${pageNum} 时出错:`, pageError);
      }
    }

    console.log(`从PDF中提取了 ${images.length} 张图片`);
    return images;
  } catch (error) {
    console.error('渲染PDF页面为图像失败:', error);

    // 如果完全失败，返回空数组
    return [];
  }
}

// 备用方法：使用pdf-lib提取PDF页面作为图像
async function extractImagesFromPdfFallback(pdfPath, outputDir) {
  try {
    console.log('使用备用方法从PDF提取图片...');

    // 尝试使用canvas渲染页面
    return await renderPdfPagesToImages(pdfPath, outputDir);
  } catch (error) {
    console.error('备用方法提取图片错误:', error);
    return [];
  }
}