const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || 'default-secret-change-this';

const { uploadDir, avatarDir } = require('./lib/upload');

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

// Static files (CSS, JS, dll)
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint untuk melayani file upload (karena tidak di public)
app.get('/uploads/:filename', (req, res) => {
    const filePath = path.join(uploadDir, req.params.filename);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).send('File not found');
});

app.get('/avatars/:filename', (req, res) => {
    const filePath = path.join(avatarDir, req.params.filename);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).send('File not found');
});

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