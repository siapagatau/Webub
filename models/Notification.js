const mongoose = require('../lib/mongoose');

const notificationSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // UUID string
  userId: { type: String, required: true },
  type: { type: String, enum: ['like', 'comment', 'follow', 'new_post'], required: true },
  fromUserId: { type: String, required: true },
  postId: { type: String },
  commentId: { type: String },
  read: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

module.exports = mongoose.model('Notification', notificationSchema);