const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://254110405116_db_user:pswnHAroLo1lKzI0@cluster0.9kkkokx.mongodb.net/?appName=Cluster0";

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined in environment variables');
}

// Buat clientPromise yang mengembalikan client MongoDB setelah koneksi sukses
const clientPromise = mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('✅ MongoDB connected');
  return mongoose.connection.getClient();
}).catch(err => {
  console.error('❌ MongoDB error:', err);
  process.exit(1); // Hentikan aplikasi jika gagal koneksi
});

// Event listener untuk logging
mongoose.connection.on('connected', () => console.log('✅ MongoDB connected (event)'));
mongoose.connection.on('error', (err) => console.error('❌ MongoDB error (event):', err));

module.exports = {
  mongoose,
  MONGODB_URI,
  clientPromise,
};