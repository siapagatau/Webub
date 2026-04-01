const mongoose = require('../lib/mongoose');

const postSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // UUID string
  userId: { type: String, required: true },
  mediaUrl: { type: String, required: true },
  mediaType: { type: String, enum: ['image', 'video', 'audio', 'gif', 'other'], default: 'other' },
  mimeType: { type: String },
  caption: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  size: { type: Number }
}, { _id: false });

module.exports = mongoose.model('Post', postSchema);