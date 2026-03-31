const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || 'default-secret-change-this';

// Pastikan folder upload ada
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`📁 Folder upload dibuat: ${uploadDir}`);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Load routes dengan penanganan error detail
const routesPath = path.join(__dirname, 'plugins', 'routes');
try {
  const routes = require(routesPath);
  app.use('/', routes);
  console.log('✅ Routes berhasil dimuat dari', routesPath);
} catch (err) {
  console.error('❌ Gagal memuat routes:', err.message);
  console.error('Stack:', err.stack);
  app.get('/', (req, res) => {
    res.status(500).send(`
      <h1>Error memuat routes</h1>
      <p>${err.message}</p>
      <pre>${err.stack}</pre>
    `);
  });
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
    console.log(`📁 Folder upload: ${uploadDir}`);
  });
}

module.exports = app;
