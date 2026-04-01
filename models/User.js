const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // UUID string
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  bio: { type: String, default: 'Halo! Saya pengguna baru 👋' },
  avatar: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

module.exports = mongoose.model('User', userSchema);