const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://254110405116_db_user:pswnHAroLo1lKzI0@cluster0.9kkkokx.mongodb.net/?appName=Cluster0";

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined in environment variables');
}

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on('connected', () => console.log('✅ MongoDB connected'));
mongoose.connection.on('error', (err) => console.error('❌ MongoDB error:', err));

module.exports = mongoose;
module.exports.MONGODB_URI = MONGODB_URI; // Ekspor URI untuk digunakan di session store