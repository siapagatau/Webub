const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs'); // Ganti dari bcrypt ke bcryptjs

const adapter = new FileSync(path.join(__dirname, '../database/global.db'));
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