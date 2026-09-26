const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024; // 5 MB default
const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// ─── Storage engine ─────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (_req, _file, cb) => {
        // Cryptographically secure random filename — never use Math.random()
        const uuid = crypto.randomUUID();
        const ts   = Date.now();
        cb(null, `${uuid}_${ts}.pdf`);
    }
});

// ─── File filter ─────────────────────────────────────────────────────────────
function fileFilter(_req, file, cb) {
    const ext      = path.extname(file.originalname).toLowerCase();
    const mimeOk   = file.mimetype === 'application/pdf';
    const extOk    = ext === '.pdf';

    if (mimeOk && extOk) {
        cb(null, true);
    } else {
        const err = new Error('Only PDF files are accepted');
        err.status = 400;
        err.code   = 'INVALID_FILE_TYPE';
        cb(err, false);
    }
}

// ─── Multer instance ─────────────────────────────────────────────────────────
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE }
});

const pictureStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}_${Date.now()}${path.extname(file.originalname).toLowerCase()}`)
});
const pictureUpload = multer({
    storage: pictureStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
        if (allowed[path.extname(file.originalname).toLowerCase()] === file.mimetype) return cb(null, true);
        const err = new Error('Upload a JPG, PNG, or WebP image.');
        err.status = 400;
        err.code = 'INVALID_IMAGE_TYPE';
        cb(err);
    }
});

module.exports = { upload, pictureUpload };
