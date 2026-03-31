const mongoose = require('../lib/mongoose');

const commentSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // UUID string
  postId: { type: String, required: true },
  userId: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Comment', commentSchema);