const mongoose = require('../lib/mongoose');

const likeSchema = new mongoose.Schema({
  postId: { type: String, required: true },
  userId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

// Compound index untuk mencegah like ganda
likeSchema.index({ postId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Like', likeSchema);