const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

let dbPath;
if (process.env.VERCEL) {
    dbPath = '/tmp/global.db';
} else {
    const dbDir = path.join(__dirname, '../database');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    dbPath = path.join(dbDir, 'global.db');
}

const adapter = new FileSync(dbPath);
const db = low(adapter);

db.defaults({
    users: [],
    posts: [],
    likes: [],
    comments: [],
    follows: [],
    notifications: []
}).write();

module.exports = { db, uuidv4, bcrypt };