const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const app = express();

// ========================
//  Konfigurasi Environment
// ========================
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || 'default-secret-change-this';

// ========================
//  Pastikan folder upload ada
// ========================
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`📁 Folder upload dibuat: ${uploadDir}`);
}

// ========================
//  Setup View Engine
// ========================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ========================
//  Middleware
// ========================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session dengan store sederhana (tidak disarankan untuk production di Vercel)
// Untuk Vercel, lebih baik gunakan JWT atau session store eksternal (Redis, MongoDB).
// Tapi jika hanya untuk testing, tetap bisa berjalan.
app.use(session({
  secret: SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 hari
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ========================
//  Routes
// ========================
try {
  const routes = require('./plugins/routes');
  app.use('/', routes);
} catch (err) {
  console.error('❌ Gagal memuat routes:', err.message);
  // Fallback route agar aplikasi tetap bisa merespon
  app.get('/', (req, res) => {
    res.send('🚀 Server berjalan, tapi routes tidak ditemukan. Periksa file ./plugins/routes');
  });
}

// ========================
//  Error Handler
// ========================
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).send('❌ Terjadi error: ' + err.message);
});

// 404 Handler
app.use((req, res) => {
  res.status(404).send('404 - Halaman tidak ditemukan 🏝️');
});

// ========================
//  Jalankan Server (hanya untuk local)
// ========================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
    console.log(`📁 Folder upload: ${uploadDir}`);
  });
}

// Export app untuk Vercel
module.exports = app;