const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Tentukan direktori penyimpanan berdasarkan environment
let uploadDir, avatarDir;
if (process.env.VERCEL) {
    uploadDir = '/tmp/uploads';
    avatarDir = '/tmp/avatars';
} else {
    uploadDir = path.join(__dirname, '../public/uploads');
    avatarDir = path.join(__dirname, '../public/avatars');
}

// Buat direktori jika belum ada
[uploadDir, avatarDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Storage untuk postingan (file media)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${uuidv4()}${ext}`);
    }
});

// Storage untuk avatar
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `avatar-${req.session.userId}-${Date.now()}${ext}`);
    }
});

// Filter untuk file media (postingan)
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime',
        'audio/mpeg', 'audio/wav', 'audio/ogg'
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipe file tidak didukung'), false);
    }
};

// Filter untuk avatar (hanya gambar)
const avatarFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Hanya file gambar yang diperbolehkan'), false);
    }
};

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter
});

const uploadAvatar = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: avatarFilter
});

module.exports = { upload, uploadAvatar, uploadDir, avatarDir };