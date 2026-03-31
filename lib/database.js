const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// Tentukan lokasi database
let dbPath;
if (process.env.VERCEL) {
    // Di Vercel, gunakan /tmp (writable)
    dbPath = '/tmp/global.db';
} else {
    // Lokal, simpan di folder database
    const dbDir = path.join(__dirname, '../database');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    dbPath = path.join(dbDir, 'global.db');
}

const adapter = new FileSync(dbPath);
const db = low(adapter);

// Set default data dengan struktur lengkap
db.defaults({
    users: [],
    posts: [],
    likes: [],
    follows: [],
    comments: [],
    notifications: []
}).write();

module.exports = { db, uuidv4, bcrypt };