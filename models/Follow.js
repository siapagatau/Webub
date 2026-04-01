const mongoose = require('mongoose');

const followSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // UUID string
  followerId: { type: String, required: true },
  followingId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

module.exports = mongoose.model('Follow', followSchema);