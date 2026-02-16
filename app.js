const express = require('express');
const session = require('express-session');
const path = require('path');
const routes = require('./plugins/routes');
const app = express();

// Setup view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 hari
}));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', routes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('❌ Terjadi error: ' + err.message);
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('404 - Halaman tidak ditemukan 🏝️');
});

// Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`📁 Folder upload: ${path.join(__dirname, 'public/uploads')}`);
});