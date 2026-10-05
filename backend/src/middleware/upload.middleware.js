const path = require('path');
const multer = require('multer');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024; // 5 MB default
// Buffer uploads for validation/AI processing before sending them to Cloudinary.
const storage = multer.memoryStorage();

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

const resumeTypes = {
    '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp'
};
const resumeUpload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const jpgAlias = ['.jpg', '.jpeg'].includes(ext) && file.mimetype === 'image/jpg';
        if (resumeTypes[ext] === file.mimetype || jpgAlias) return cb(null, true);
        const err = new Error('Upload a PDF, JPG, JPEG, PNG, or WebP resume.');
        err.status = 400; err.code = 'INVALID_FILE_TYPE'; cb(err);
    }
});

const documentTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
};
const documentUpload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const jpgAlias = ['.jpg', '.jpeg'].includes(ext) && file.mimetype === 'image/jpg';
        if (documentTypes[ext] === file.mimetype || jpgAlias) return cb(null, true);
        const err = new Error('Upload a PDF, JPG, JPEG, PNG, or WebP document.');
        err.status = 400; err.code = 'INVALID_FILE_TYPE'; cb(err);
    }
});

const pictureUpload = multer({
    storage,
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

module.exports = { upload, resumeUpload, documentUpload, pictureUpload };
