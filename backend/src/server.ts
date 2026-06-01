import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { initDb } from './db';
import { sendOtp, verifyOtp } from './controllers/auth.controller';
import { processOcr } from './controllers/ocr.controller';
import { createApplication, saveApplication, getApplication, listApplications, exportApplicationsExcel } from './controllers/application.controller';
import { generatePdf } from './controllers/pdf.controller';
import { authenticateToken } from './middleware/auth';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Support large signature images
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url}`);
  next();
});

// Ensure upload and asset directories exist on startup
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const ASSETS_DIR = path.join(__dirname, 'assets');

[UPLOADS_DIR, ASSETS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Serve uploaded files statically for frontend document previews
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/assets', express.static(ASSETS_DIR));

// Configure Multer for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit to be safe
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp|gif|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype) || file.mimetype === 'application/octet-stream';
    if (mimetype || extname) {
      return cb(null, true);
    }
    cb(new Error('Only images (JPEG/PNG/WEBP/GIF) and PDFs are allowed'));
  }
});

// --- API ROUTES ---

// 1. Authentication Routes
app.post('/api/auth/send-otp', sendOtp);
app.post('/api/auth/verify-otp', verifyOtp);

// 2. OCR Extraction Route (Protected)
app.post('/api/ocr/upload', authenticateToken, upload.single('document'), processOcr);

// 3. Applications CRUD Routes (Protected)
app.post('/api/applications', authenticateToken, createApplication);
app.get('/api/applications', authenticateToken, listApplications);
app.get('/api/applications/export-excel', authenticateToken, exportApplicationsExcel);
app.get('/api/applications/:id', authenticateToken, getApplication);
app.put('/api/applications/:id', authenticateToken, saveApplication);

// 4. PDF Compilation Route (Protected)
app.get('/api/applications/:id/pdf', authenticateToken, generatePdf);

// Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Error handling middleware (specifically for Multer file type/limit errors)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err) {
    console.error('[Global Error Handler] Caught error:', err.message);
    return res.status(400).json({ error: err.message || 'File upload or processing error' });
  }
  next();
});

// Start Server & Initialize Database
async function startServer() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`🚀 Annapurna Auto Form Fill Backend running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
// Trigger nodemon restart after port conflict resolved
