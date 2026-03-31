const multer = require('multer');
const { put, del } = require('@vercel/blob');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Gunakan memory storage agar file langsung bisa di-upload ke blob
const storage = multer.memoryStorage();

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

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter
});

// Filter untuk avatar (hanya gambar)
const avatarFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Hanya file gambar yang diperbolehkan'), false);
  }
};

const uploadAvatar = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: avatarFilter
});

// Fungsi upload ke Vercel Blob
const uploadToBlob = async (file, folder) => {
  const ext = path.extname(file.originalname);
  const filename = `${folder}/${Date.now()}-${uuidv4()}${ext}`;
  const blob = await put(filename, file.buffer, {
    access: 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN
  });
  return blob.url;
};

// Fungsi hapus dari Vercel Blob
const deleteFromBlob = async (url) => {
  try {
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (err) {
    console.error('Gagal hapus dari blob:', err);
  }
};

module.exports = { upload, uploadAvatar, uploadToBlob, deleteFromBlob };