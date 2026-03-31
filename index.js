const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || '7f9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a';

// Import mongoose (memulai koneksi) dan ambil URI
const mongoose = require('./lib/mongoose');
const MONGODB_URI = mongoose.MONGODB_URI; // atau langsung gunakan string dari environment

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// **PERBAIKAN**: Gunakan mongoUrl, bukan mongooseConnection
app.use(session({
  secret: SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGODB_URI,  // <-- pakai connection string langsung
    ttl: 14 * 24 * 60 * 60,
    autoRemove: 'native',
    touchAfter: 24 * 3600
  }),
  cookie: {
    maxAge: 14 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: false
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes utama
try {
  const routes = require('./plugins/routes');
  app.use('/', routes);
  console.log('✅ Routes berhasil dimuat');
} catch (err) {
  console.error('❌ Gagal memuat routes:', err.message);
  app.get('/', (req, res) => res.send(`Error: ${err.message}`));
}

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('❌ Terjadi error: ' + err.message);
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('404 - Halaman tidak ditemukan 🏝️');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  });
}

module.exports = app;