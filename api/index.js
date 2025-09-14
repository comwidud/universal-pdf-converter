const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const mime = require('mime-types');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');

const app = express();
const PORT = process.env.PORT || 3001;

// Use temporary directory for Vercel
const uploadsDir = '/tmp/uploads';
const outputDir = '/tmp/output';

// Safely ensure directories exist
try {
  fs.ensureDirSync(uploadsDir);
  fs.ensureDirSync(outputDir);
} catch (error) {
  console.warn('Directory creation warning:', error.message);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-_가-힣]/g, '_');
    cb(null, `${timestamp}-${sanitizedName}`);
  }
});

// Supported file types (expanded to include more formats)
const supportedTypes = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/plain': ['.txt'],
  'text/html': ['.html', '.htm'],
  'application/octet-stream': ['.hwp', '.hwpx'], // HWP files
  'application/vnd.hancom.hwp': ['.hwp'],
  'application/x-hwp': ['.hwp'],
  'application/haansofthwp': ['.hwp'],
  'application/x-tika-msoffice': ['.hwp']
};

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const fileExt = path.extname(file.originalname).toLowerCase();
    const fileName = file.originalname.toLowerCase();

    // Always allow common file extensions
    const commonExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp',
                       '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.txt', '.html', '.htm',
                       '.hwp', '.hwpx', '.rtf', '.odt', '.ods', '.ppt', '.pptx'];

    // Special handling for HWP files (sometimes they have no extension or weird MIME types)
    if (fileName.includes('.hwp') || file.mimetype === 'application/octet-stream' && fileName.endsWith('.hwp')) {
      console.log(`HWP file detected: ${file.originalname}, MIME: ${file.mimetype}`);
      cb(null, true);
    } else if (commonExts.includes(fileExt)) {
      cb(null, true);
    } else {
      // For unknown file types, still allow but warn
      console.log(`Unknown file type: ${fileExt} (${file.mimetype}), but allowing upload`);
      cb(null, true);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Serve static files from correct path in Vercel
app.use(express.static(path.join(__dirname, '../public')));
app.use('/output', express.static(outputDir));
app.use('/uploads', express.static(uploadsDir));

// Helper function to detect and convert text encoding
function detectAndConvertEncoding(buffer, filePath) {
  try {
    // Try to detect encoding
    const detected = jschardet.detect(buffer);
    let encoding = detected.encoding;

    // Common Korean encodings
    if (encoding === 'windows-1252' || encoding === 'ISO-8859-1') {
      // These are often misdetected for Korean files
      encoding = 'euc-kr';
    }

    // Try different encodings for Korean text
    const encodingsToTry = [encoding, 'utf8', 'euc-kr', 'cp949', 'iso-2022-kr'];

    for (const enc of encodingsToTry) {
      try {
        if (enc && iconv.encodingExists(enc)) {
          const decoded = iconv.decode(buffer, enc);
          // Check if decoded text looks reasonable (contains Korean or ASCII)
          if (decoded && (decoded.match(/[가-힣]/) || decoded.match(/[a-zA-Z0-9]/))) {
            console.log(`Successfully decoded ${filePath} with encoding: ${enc}`);
            return decoded;
          }
        }
      } catch (err) {
        continue;
      }
    }

    // Fallback to UTF-8
    return buffer.toString('utf8');
  } catch (error) {
    console.error(`Encoding detection failed for ${filePath}:`, error);
    return buffer.toString('utf8');
  }
}

// Helper function to wrap text into lines with better Korean support
function wrapText(text, maxWidth, font) {
  if (!text) return [''];

  // Split by both spaces and Korean sentence endings
  const sentences = text.split(/(?<=[.!?。])\s+|(?<=[가-힣])\s+(?=[가-힣])/);
  const lines = [];
  let currentLine = '';

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      // Calculate approximate width (Korean characters are wider)
      const koreanChars = (testLine.match(/[가-힣]/g) || []).length;
      const otherChars = testLine.length - koreanChars;
      const approximateWidth = (koreanChars * 20) + (otherChars * 12);

      if (approximateWidth <= maxWidth && testLine.length < 60) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Word is too long, split it
          if (word.length > 60) {
            lines.push(word.substring(0, 60));
            currentLine = word.substring(60);
          } else {
            lines.push(word);
          }
        }
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

// Helper function to convert various formats to images for PDF
async function convertToImage(filePath, outputPath, fileType) {
  const ext = path.extname(filePath).toLowerCase();

  try {
    switch (ext) {
      case '.jpg':
      case '.jpeg':
      case '.png':
      case '.gif':
      case '.bmp':
      case '.tiff':
      case '.tif':
      case '.webp':
        // Convert to JPEG using Sharp
        await sharp(filePath)
          .jpeg({ quality: 95 })
          .toFile(outputPath);
        return true;

      case '.docx':
        try {
          // Convert DOCX to text using mammoth
          const docxResult = await mammoth.extractRawText({ path: filePath });
          const text = docxResult.value || '문서 내용을 읽을 수 없습니다.';

          return await createTextImage(text, outputPath, 'Word 문서');
        } catch (error) {
          console.error('DOCX conversion error:', error);
          return await createErrorImage(outputPath, 'DOCX 파일을 읽을 수 없습니다.');
        }

      case '.xlsx':
      case '.xls':
        try {
          // Try multiple approaches for Excel files with Korean text
          let workbook;
          let excelContent = '';

          // First try: Read with Korean codepage
          try {
            workbook = XLSX.readFile(filePath, {
              cellText: false,
              cellFormula: false,
              sheetStubs: true,
              codepage: 949,
              type: 'file'
            });
          } catch (e1) {
            // Second try: Read with UTF-8
            try {
              workbook = XLSX.readFile(filePath, {
                cellText: false,
                cellFormula: false,
                sheetStubs: true,
                type: 'file'
              });
            } catch (e2) {
              // Third try: Read as buffer with encoding detection
              const buffer = fs.readFileSync(filePath);
              workbook = XLSX.read(buffer, {
                cellText: false,
                cellFormula: false,
                sheetStubs: true,
                type: 'buffer'
              });
            }
          }

          const sheetNames = workbook.SheetNames;

          for (let i = 0; i < Math.min(sheetNames.length, 3); i++) {
            const sheetName = sheetNames[i];
            const worksheet = workbook.Sheets[sheetName];
            excelContent += `[${sheetName}]\n`;

            // Convert to CSV for better text extraction
            try {
              const csvContent = XLSX.utils.sheet_to_csv(worksheet, {FS: '|'});
              const lines = csvContent.split('\n');

              // Take first 20 rows
              for (let j = 0; j < Math.min(lines.length, 20); j++) {
                const line = lines[j].trim();
                if (line && line !== '|'.repeat(10)) {
                  excelContent += line + '\n';
                }
              }

              if (lines.length > 20) {
                excelContent += '... (더 많은 행이 있습니다)\n';
              }
            } catch (csvError) {
              // Fallback: manual cell extraction
              const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:Z100');
              let rowCount = 0;

              for (let R = range.s.r; R <= Math.min(range.e.r, range.s.r + 19); ++R) {
                let rowData = [];
                let hasData = false;

                for (let C = range.s.c; C <= Math.min(range.e.c, range.s.c + 10); ++C) {
                  const cellAddress = XLSX.utils.encode_cell({c: C, r: R});
                  const cell = worksheet[cellAddress];

                  if (cell && cell.v !== null && cell.v !== undefined) {
                    let cellValue = cell.v.toString().trim();
                    rowData.push(cellValue);
                    hasData = true;
                  } else {
                    rowData.push('');
                  }
                }

                if (hasData) {
                  excelContent += rowData.join(' | ') + '\n';
                  rowCount++;
                }
              }

              if (range.e.r > range.s.r + 19) {
                excelContent += '... (더 많은 행이 있습니다)\n';
              }
            }

            excelContent += '\n';
          }

          if (sheetNames.length > 3) {
            excelContent += `... 그리고 ${sheetNames.length - 3}개의 시트가 더 있습니다.`;
          }

          if (!excelContent.trim()) {
            excelContent = 'Excel 파일에서 데이터를 추출할 수 없습니다.';
          }

          return await createTextImage(excelContent, outputPath, 'Excel 문서');
        } catch (error) {
          console.error('Excel conversion error:', error);
          return await createErrorImage(outputPath, `Excel 파일 처리 오류: ${error.message}`);
        }

      case '.txt':
        try {
          // Read file with proper encoding detection
          const buffer = fs.readFileSync(filePath);
          const textContent = detectAndConvertEncoding(buffer, filePath);

          return await createTextImage(textContent, outputPath, '텍스트 파일');
        } catch (error) {
          console.error('Text conversion error:', error);
          return await createErrorImage(outputPath, '텍스트 파일을 읽을 수 없습니다.');
        }

      case '.html':
      case '.htm':
        try {
          // Read HTML file with encoding detection
          const buffer = fs.readFileSync(filePath);
          const htmlContent = detectAndConvertEncoding(buffer, filePath);

          // Simple HTML tag removal with better Korean support
          const textContent = htmlContent
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
            .replace(/\s+/g, ' ')
            .trim();

          return await createTextImage(textContent, outputPath, 'HTML 문서');
        } catch (error) {
          console.error('HTML conversion error:', error);
          return await createErrorImage(outputPath, 'HTML 파일을 읽을 수 없습니다.');
        }

      case '.hwp':
      case '.hwpx':
        try {
          console.log(`Processing HWP file: ${filePath}`);

          // HWP files are complex binary format, try multiple extraction methods
          const buffer = fs.readFileSync(filePath);
          let extractedText = '';

          // Method 1: Try different encodings
          const encodingsToTry = ['utf8', 'euc-kr', 'cp949', 'utf16le'];

          for (const encoding of encodingsToTry) {
            try {
              if (encoding === 'utf8') {
                const text = buffer.toString('utf8');
                const matches = text.match(/[가-힣][가-힣\s]{2,}/g);
                if (matches && matches.length > 0) {
                  extractedText += matches.join(' ') + '\n';
                }
              } else {
                const decoded = iconv.decode(buffer, encoding);
                const matches = decoded.match(/[가-힣][가-힣\s]{2,}/g);
                if (matches && matches.length > 0) {
                  extractedText += matches.join(' ') + '\n';
                }
              }
            } catch (err) {
              continue;
            }
          }

          // Method 2: Binary pattern matching for Korean text
          const binaryText = buffer.toString('binary');

          // Look for Korean Unicode patterns
          const koreanMatches = binaryText.match(/[\uAC00-\uD7AF\s]+/g);
          if (koreanMatches) {
            extractedText += koreanMatches.filter(match =>
              match.length > 3 && match.trim().length > 0
            ).join(' ') + '\n';
          }

          // Look for ASCII text
          const asciiMatches = binaryText.match(/[a-zA-Z0-9\s.,!?가-힣]{4,}/g);
          if (asciiMatches) {
            extractedText += asciiMatches.filter(match =>
              match.length > 4 && match.trim().length > 0 &&
              /[가-힣a-zA-Z]/.test(match)
            ).slice(0, 10).join(' ') + '\n';
          }

          // Clean up extracted text
          extractedText = extractedText
            .replace(/\s+/g, ' ')
            .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
            .trim();

          if (!extractedText || extractedText.length < 10) {
            extractedText = `HWP 파일 정보:\n파일명: ${path.basename(filePath)}\n파일 크기: ${Math.round(buffer.length / 1024)} KB\n\n이 파일은 한글과컴퓨터의 HWP 형식입니다.\n텍스트 추출이 제한적일 수 있습니다.\n\n완전한 변환을 위해서는:\n1. 한글 프로그램에서 파일을 열어주세요\n2. 텍스트 형식(.txt)으로 저장 후 업로드해보세요\n3. 또는 Word 형식(.docx)으로 저장 후 업로드해보세요`;
          } else {
            extractedText = `HWP 문서에서 추출된 텍스트:\n\n${extractedText.substring(0, 2000)}${extractedText.length > 2000 ? '\n\n... (텍스트가 잘렸습니다)' : ''}`;
          }

          return await createTextImage(extractedText, outputPath, 'HWP 문서');
        } catch (error) {
          console.error('HWP conversion error:', error);
          return await createErrorImage(outputPath, `HWP 파일 처리 오류: ${error.message}`);
        }

      case '.pdf':
        // For PDF files, we'll add them directly to the final PDF
        return 'pdf';

      default:
        // Try to handle as text file for unknown extensions
        try {
          const buffer = fs.readFileSync(filePath);
          const textContent = detectAndConvertEncoding(buffer, filePath);

          // Check if it looks like text content
          if (textContent && textContent.match(/[가-힣a-zA-Z0-9]/)) {
            return await createTextImage(textContent, outputPath, `${ext} 파일`);
          } else {
            return await createErrorImage(outputPath, `지원하지 않는 파일 형식: ${ext}`);
          }
        } catch (error) {
          return await createErrorImage(outputPath, `파일을 읽을 수 없습니다: ${ext}`);
        }
    }
  } catch (error) {
    console.error(`Error converting ${filePath}:`, error);
    return await createErrorImage(outputPath, '파일 변환 중 오류가 발생했습니다.');
  }
}

// Helper function to create text image with Korean font support using Sharp
async function createTextImage(text, outputPath, fileType) {
  try {
    if (!text || text.trim().length === 0) {
      text = '내용이 비어 있습니다.';
    }

    // Clean and prepare text
    const cleanText = text.substring(0, 3000)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // Split text into lines
    const maxLineLength = 70;
    const words = cleanText.split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).length <= maxLineLength) {
        currentLine = currentLine ? currentLine + ' ' + word : word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          lines.push(word.substring(0, maxLineLength));
          currentLine = word.substring(maxLineLength);
        }
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    // Limit to 40 lines to fit page
    const displayLines = lines.slice(0, 40);
    const moreLinesText = lines.length > 40 ? '\n\n... (더 많은 내용이 잘렸습니다)' : '';

    // Create SVG with Korean text support
    const svgContent = `
      <svg width="595" height="842" xmlns="http://www.w3.org/2000/svg">
        <rect width="595" height="842" fill="white"/>

        <!-- Border -->
        <rect x="20" y="20" width="555" height="802" fill="none" stroke="#cccccc" stroke-width="1"/>

        <!-- Title -->
        <text x="30" y="50" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="black">
          📄 ${fileType.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </text>

        <!-- Separator line -->
        <line x1="30" y1="65" x2="565" y2="65" stroke="black" stroke-width="1" stroke-dasharray="2,2"/>

        <!-- Content -->
        ${displayLines.map((line, index) => {
          const y = 90 + (index * 18);
          return `<text x="30" y="${y}" font-family="Arial, sans-serif" font-size="14" fill="black">${line}</text>`;
        }).join('\n        ')}

        ${moreLinesText ? `<text x="30" y="${90 + (displayLines.length * 18) + 10}" font-family="Arial, sans-serif" font-size="12" fill="gray">${moreLinesText}</text>` : ''}
      </svg>
    `;

    // Convert SVG to image using Sharp
    const svgBuffer = Buffer.from(svgContent, 'utf8');

    await sharp(svgBuffer)
      .png()
      .toFile(outputPath.replace('.jpg', '.png'));

    // Convert PNG to JPG for consistency
    await sharp(outputPath.replace('.jpg', '.png'))
      .jpeg({ quality: 95 })
      .toFile(outputPath);

    // Clean up PNG file
    try {
      fs.unlinkSync(outputPath.replace('.jpg', '.png'));
    } catch (e) {
      // Ignore cleanup errors
    }

    return true;
  } catch (error) {
    console.error('Error creating text image with Sharp:', error);
    // Fallback to simpler method
    return await createSimpleTextImage(text, outputPath, fileType);
  }
}

// Fallback function for text image creation
async function createSimpleTextImage(text, outputPath, fileType) {
  try {
    // Create a simple white background with basic text info
    const image = await sharp({
      create: {
        width: 595,
        height: 842,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    })
    .png()
    .toBuffer();

    // Add basic overlay text using Sharp's composite
    const titleSvg = `
      <svg width="595" height="100">
        <rect width="595" height="100" fill="white"/>
        <text x="30" y="40" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="black">
          ${fileType} - Korean Text Detected
        </text>
        <text x="30" y="70" font-family="Arial, sans-serif" font-size="12" fill="gray">
          Text length: ${text.length} characters
        </text>
      </svg>
    `;

    await sharp(image)
      .composite([{
        input: Buffer.from(titleSvg),
        top: 20,
        left: 0
      }])
      .jpeg({ quality: 95 })
      .toFile(outputPath);

    return true;
  } catch (error) {
    console.error('Error in fallback text image creation:', error);
    return false;
  }
}

// Helper function to create error image using Sharp
async function createErrorImage(outputPath, errorMessage) {
  try {
    // Clean error message for SVG
    const cleanMessage = errorMessage
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const errorSvg = `
      <svg width="595" height="842" xmlns="http://www.w3.org/2000/svg">
        <rect width="595" height="842" fill="white"/>
        <rect x="20" y="20" width="555" height="802" fill="none" stroke="#cccccc" stroke-width="1"/>

        <text x="50" y="300" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#e74c3c">
          ⚠️ 변환 오류
        </text>
        <text x="50" y="350" font-family="Arial, sans-serif" font-size="14" fill="black">
          ${cleanMessage}
        </text>
        <text x="50" y="400" font-family="Arial, sans-serif" font-size="12" fill="gray">
          이 페이지는 오류 페이지로 처리됩니다.
        </text>
      </svg>
    `;

    const svgBuffer = Buffer.from(errorSvg, 'utf8');

    await sharp(svgBuffer)
      .jpeg({ quality: 95 })
      .toFile(outputPath);

    return true;
  } catch (error) {
    console.error('Error creating error image:', error);
    // Create minimal error image
    await sharp({
      create: {
        width: 595,
        height: 842,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    })
    .jpeg({ quality: 95 })
    .toFile(outputPath);

    return true;
  }
}

// Calculate target file size based on compression settings
function calculateCompressionSettings(compressionType, targetSizeKB, currentSizeKB) {
  let quality = 80;
  let compressionRatio = 1;

  switch (compressionType) {
    case 'low':
      quality = 95;
      compressionRatio = 0.9;
      break;
    case 'medium':
      quality = 80;
      compressionRatio = 0.7;
      break;
    case 'high':
      quality = 60;
      compressionRatio = 0.5;
      break;
    case 'custom':
      if (targetSizeKB && currentSizeKB) {
        compressionRatio = targetSizeKB / currentSizeKB;
        if (compressionRatio > 0.9) quality = 95;
        else if (compressionRatio > 0.7) quality = 85;
        else if (compressionRatio > 0.5) quality = 70;
        else if (compressionRatio > 0.3) quality = 55;
        else quality = 40;
      }
      break;
    default:
      quality = 80;
      compressionRatio = 0.7;
  }

  return { quality: Math.max(10, Math.min(100, quality)), compressionRatio };
}

// Upload endpoint
app.post('/upload', upload.array('files', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const fileInfo = req.files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype,
      type: getFileType(file.mimetype, file.originalname)
    }));

    res.json({
      success: true,
      files: fileInfo,
      message: `${req.files.length} files uploaded successfully`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get file type for display
function getFileType(mimetype, filename) {
  const ext = path.extname(filename).toLowerCase();

  if (mimetype.startsWith('image/')) return 'image';
  if (ext === '.pdf') return 'pdf';
  if (['.doc', '.docx', '.hwp', '.hwpx'].includes(ext)) return 'document';
  if (['.xls', '.xlsx'].includes(ext)) return 'spreadsheet';
  if (['.txt', '.html', '.htm'].includes(ext)) return 'text';
  return 'file';
}

// Convert files to PDF endpoint
app.post('/convert', express.json(), async (req, res) => {
  try {
    const { files, compression = 'medium', targetSizeKB, compressionRatio } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided for conversion' });
    }

    // Create new PDF document
    const pdfDoc = await PDFDocument.create();
    const tempDir = path.join(__dirname, 'temp');
    fs.ensureDirSync(tempDir);

    // Calculate total original size
    let totalOriginalSize = 0;
    for (const fileInfo of files) {
      totalOriginalSize += fileInfo.size;
    }

    const compressionSettings = calculateCompressionSettings(
      compression,
      targetSizeKB,
      totalOriginalSize / 1024
    );

    // Process each file
    for (const fileInfo of files) {
      const filePath = path.join(__dirname, 'uploads', fileInfo.filename);

      if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        continue;
      }

      try {
        const ext = path.extname(fileInfo.filename).toLowerCase();

        if (ext === '.pdf') {
          // If it's already a PDF, merge it
          const existingPdfBytes = fs.readFileSync(filePath);
          const existingPdf = await PDFDocument.load(existingPdfBytes);
          const copiedPages = await pdfDoc.copyPages(existingPdf, existingPdf.getPageIndices());
          copiedPages.forEach((page) => pdfDoc.addPage(page));
        } else {
          // Convert other files to image first
          const tempImagePath = path.join(tempDir, `temp-${Date.now()}.jpg`);
          const conversionResult = await convertToImage(filePath, tempImagePath, fileInfo.type);

          if (conversionResult === true && fs.existsSync(tempImagePath)) {
            // Process converted image with compression
            const processedImageBuffer = await sharp(tempImagePath)
              .jpeg({ quality: compressionSettings.quality })
              .toBuffer();

            // Embed image in PDF
            const jpgImage = await pdfDoc.embedJpg(processedImageBuffer);
            const jpgDims = jpgImage.scale(1);

            // Add page with appropriate size (A4 format)
            const page = pdfDoc.addPage([595, 842]); // A4 size in points

            // Scale image to fit page if necessary
            const scaleX = 595 / jpgDims.width;
            const scaleY = 842 / jpgDims.height;
            const scale = Math.min(scaleX, scaleY, 1);

            page.drawImage(jpgImage, {
              x: (595 - jpgDims.width * scale) / 2,
              y: (842 - jpgDims.height * scale) / 2,
              width: jpgDims.width * scale,
              height: jpgDims.height * scale,
            });

            // Clean up temp file
            fs.unlinkSync(tempImagePath);
          }
        }
      } catch (fileError) {
        console.error(`Error processing file ${fileInfo.filename}:`, fileError);

        // Add an error page to PDF
        const page = pdfDoc.addPage([595, 842]);
        page.drawText(`Error processing: ${fileInfo.originalname}`, {
          x: 50,
          y: 750,
          size: 16,
        });
        page.drawText(`Error: ${fileError.message}`, {
          x: 50,
          y: 720,
          size: 12,
        });
      }
    }

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    const outputFilename = `converted-${Date.now()}.pdf`;
    const outputPath = path.join(outputDir, outputFilename);

    await fs.writeFile(outputPath, pdfBytes);

    // Get output file size
    const outputStats = fs.statSync(outputPath);
    const outputSizeKB = Math.round(outputStats.size / 1024);

    // Clean up uploaded files and temp directory
    for (const fileInfo of files) {
      const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
      if (fs.existsSync(filePath)) {
        await fs.unlink(filePath);
      }
    }
    fs.removeSync(tempDir);

    res.json({
      success: true,
      filename: outputFilename,
      downloadUrl: `/output/${outputFilename}`,
      originalSizeKB: Math.round(totalOriginalSize / 1024),
      compressedSizeKB: outputSizeKB,
      compressionRatio: Math.max(0, Math.round((1 - (outputSizeKB / (totalOriginalSize / 1024))) * 100)),
      message: 'PDF converted successfully'
    });

  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({ error: 'Failed to convert PDF: ' + error.message });
  }
});

// Delete file endpoint
app.delete('/delete/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: 'File deleted successfully' });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum is 20 files.' });
    }
  }
  res.status(500).json({ error: error.message });
});

// Export for Vercel
module.exports = app;