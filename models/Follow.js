const mongoose = require('../lib/mongoose');

const followSchema = new mongoose.Schema({
  followerId: { type: String, required: true },
  followingId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

module.exports = mongoose.model('Follow', followSchema);