// Vercel serverless function format
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
const storage = multer.memoryStorage(); // Use memory storage for serverless
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Main handler function for Vercel
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { url } = req;

  // Route handling
  if (url === '/' && req.method === 'GET') {
    // Serve the main HTML file
    const htmlPath = path.join(process.cwd(), 'index.html');
    try {
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.status(200).send(html);
    } catch (error) {
      res.status(500).json({ error: 'Failed to load homepage' });
    }
    return;
  }

  if (url === '/style.css' && req.method === 'GET') {
    const cssPath = path.join(process.cwd(), 'style.css');
    try {
      const css = fs.readFileSync(cssPath, 'utf8');
      res.setHeader('Content-Type', 'text/css');
      res.status(200).send(css);
    } catch (error) {
      res.status(404).send('CSS not found');
    }
    return;
  }

  if (url === '/script.js' && req.method === 'GET') {
    const jsPath = path.join(process.cwd(), 'script.js');
    try {
      const js = fs.readFileSync(jsPath, 'utf8');
      res.setHeader('Content-Type', 'application/javascript');
      res.status(200).send(js);
    } catch (error) {
      res.status(404).send('JS not found');
    }
    return;
  }

  if (url === '/upload' && req.method === 'POST') {
    try {
      // Handle file upload
      upload.array('files', 20)(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ error: err.message });
        }

        if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: 'No files uploaded' });
        }

        const fileInfo = req.files.map(file => ({
          filename: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          buffer: file.buffer
        }));

        res.json({
          success: true,
          files: fileInfo,
          message: `${req.files.length} files uploaded successfully`
        });
      });
    } catch (error) {
      res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
    return;
  }

  if (url === '/convert' && req.method === 'POST') {
    try {
      // Handle PDF conversion
      const { files, compressionType, targetSize, compressionRatio } = req.body;

      // Simple response for now
      res.json({
        success: true,
        message: 'Conversion feature coming soon',
        downloadUrl: '/download/converted.pdf'
      });
    } catch (error) {
      res.status(500).json({ error: 'Conversion failed: ' + error.message });
    }
    return;
  }

  // Default response for unmatched routes
  res.status(404).json({ error: 'Route not found' });
}