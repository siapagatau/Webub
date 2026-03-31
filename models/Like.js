const mongoose = require('../lib/mongoose');

const likeSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // UUID string
  postId: { type: String, required: true },
  userId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

likeSchema.index({ postId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Like', likeSchema);