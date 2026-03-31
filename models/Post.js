const mongoose = require('../lib/mongoose');

const postSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // kita simpan userId string karena dari session
  mediaUrl: { type: String, required: true },
  mediaType: { type: String, enum: ['image', 'video', 'audio', 'gif', 'other'], default: 'other' },
  mimeType: { type: String },
  caption: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  size: { type: Number }
});

module.exports = mongoose.model('Post', postSchema);