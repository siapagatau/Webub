const express = require('express');
const router = express.Router();
const { db, uuidv4, bcrypt } = require('../lib/database');
//const upload = require('../lib/upload');
const { upload, uploadAvatar } = require('../lib/upload');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

// Middleware untuk mengecek login
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
};

// Middleware untuk menyediakan data user ke semua view
router.use((req, res, next) => {
  res.locals.currentUser = null;
  res.locals.emoji = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    like: '❤️',
    unlike: '🤍',
    comment: '💬',
    follow: '👥',
    upload: '📤',
    profile: '👤',
    home: '🏠',
    login: '🔐',
    logout: '🚪'
  };
  
  if (req.session.userId) {
    console.log('Session userId:', req.session.userId);
    const user = db.get('users').find({ id: req.session.userId }).value();
    console.log('Found user:', user);
    if (!user) {
      console.log('User not found, destroying session');
      req.session.destroy();
      return res.redirect('/login');
    }
    res.locals.currentUser = user;
  } else {
    res.locals.currentUser = null;
  }
  next();
});

// ==================== AUTHENTICATION ====================

// Halaman login
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  const error = req.query.error;
  let errorMessage = null;
  if (error === 'user_not_found') errorMessage = '❌ Sesi tidak valid, silakan login ulang.';
  else if (error === 'session_expired') errorMessage = '⏰ Sesi berakhir, silakan login ulang.';
  res.render('login', { error: errorMessage });
});

// Proses login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.render('login', { error: '❌ Username dan password wajib diisi' });
    }
    
    const user = db.get('users').find({ username }).value();
    
    if (!user) {
      return res.render('login', { error: '❌ Username tidak ditemukan' });
    }
    
    // Validasi password dengan bcryptjs
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.render('login', { error: '❌ Password salah' });
    }
    
    req.session.userId = user.id;
    
    // Redirect ke halaman sebelumnya jika ada
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
    
  } catch (error) {
    console.error(error);
    res.render('login', { error: '❌ Terjadi kesalahan server: ' + error.message });
  }
});

// Halaman register
router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('register', { error: null });
});

// Proses register
router.post('/register', async (req, res) => {
  try {
    const { username, password, confirmPassword, bio } = req.body;
    
    // Validasi
    if (!username || !password) {
      return res.render('register', { error: '❌ Username dan password wajib diisi' });
    }
    
    if (password.length < 6) {
      return res.render('register', { error: '❌ Password minimal 6 karakter' });
    }
    
    if (password !== confirmPassword) {
      return res.render('register', { error: '❌ Konfirmasi password tidak cocok' });
    }
    
    // Cek username unik
    const existingUser = db.get('users').find({ username }).value();
    if (existingUser) {
      return res.render('register', { error: '❌ Username sudah digunakan' });
    }
    
    // Hash password dengan bcryptjs
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    
    // Buat user baru
    const newUser = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      bio: bio || 'Halo! Saya pengguna baru 👋',
      avatar: null,
      createdAt: Date.now()
    };
    
    db.get('users').push(newUser).write();
    console.log('✅ User registered:', newUser); // Log untuk debug
    
    // Auto login
    req.session.userId = newUser.id;
    res.redirect('/profile/' + newUser.id);
    
  } catch (error) {
    console.error(error);
    res.render('register', { error: '❌ Terjadi kesalahan server: ' + error.message });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ==================== HALAMAN UTAMA ====================

// Halaman feed
router.get('/', (req, res) => {
  try {
    const posts = db.get('posts')
      .sortBy('timestamp')
      .reverse()
      .value()
      .map(post => {
        const user = db.get('users').find({ id: post.userId }).value() || { username: '[deleted]', id: null };
        const likes = db.get('likes').filter({ postId: post.id }).value() || [];
        const comments = db.get('comments').filter({ postId: post.id }).sortBy('timestamp').value() || [];
        
        // Tambahkan username ke komentar
const commentsWithUser = comments.map(c => {
  const commentUser = db.get('users').find({ id: c.userId }).value() || { username: '[deleted]', avatar: null };
  return { ...c, username: commentUser.username, avatar: commentUser.avatar };
});

        return {
          ...post,
          user,
          likesCount: likes.length,
          liked: req.session.userId ? likes.some(l => l.userId === req.session.userId) : false,
          comments: commentsWithUser
        };
      });
      
    res.render('index', { posts });
    
  } catch (error) {
    console.error(error);
    res.status(500).send('❌ Terjadi error');
  }
});

// ==================== POSTINGAN ====================

// Halaman upload
router.get('/upload', isAuthenticated, (req, res) => {
  res.render('upload', { error: null });
});

// Proses upload
router.post('/upload', isAuthenticated, upload.single('file'), (req, res) => {
  try {
    const { caption } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.render('upload', { error: '❌ Pilih file terlebih dahulu' });
    }
    
    // Deteksi tipe file
    let fileType = 'other';
    if (file.mimetype.startsWith('image/')) fileType = 'image';
    else if (file.mimetype.startsWith('video/')) fileType = 'video';
    else if (file.mimetype.startsWith('audio/')) fileType = 'audio';
    else if (file.mimetype === 'image/gif') fileType = 'gif';
    
    const post = {
      id: uuidv4(),
      userId: req.session.userId,
      mediaUrl: '/uploads/' + file.filename,
      mediaType: fileType,
      mimeType: file.mimetype,
      caption: caption || '',
      timestamp: Date.now(),
      size: file.size
    };
    
    db.get('posts').push(post).write();
    
    // Buat notifikasi untuk followers
    const followers = db.get('follows').filter({ followingId: req.session.userId }).value();
    followers.forEach(f => {
      db.get('notifications').push({
        id: uuidv4(),
        userId: f.followerId,
        type: 'new_post',
        fromUserId: req.session.userId,
        postId: post.id,
        read: false,
        timestamp: Date.now()
      }).write();
    });
    
    res.redirect('/profile/' + req.session.userId);
    
  } catch (error) {
    console.error(error);
    res.render('upload', { error: '❌ Gagal upload: ' + error.message });
  }
});

// Hapus postingan
router.post('/post/delete/:postId', isAuthenticated, (req, res) => {
  try {
    const postId = req.params.postId;
    const post = db.get('posts').find({ id: postId }).value();
    
    if (!post) return res.redirect('back');
    if (post.userId !== req.session.userId) return res.redirect('back');
    
    // Hapus file fisik
    if (post.mediaUrl) {
      const filePath = path.join(__dirname, '../public', post.mediaUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    // Hapus dari database
    db.get('posts').remove({ id: postId }).write();
    db.get('likes').remove({ postId }).write();
    db.get('comments').remove({ postId }).write();
    
    res.redirect('/profile/' + req.session.userId);
    
  } catch (error) {
    console.error(error);
    res.redirect('back');
  }
});

// Halaman detail postingan
router.get('/post/:postId', (req, res) => {
  try {
    const postId = req.params.postId;
    const post = db.get('posts').find({ id: postId }).value();
    if (!post) {
      return res.status(404).render('error', { message: 'Postingan tidak ditemukan', backLink: '/' });
    }
    const user = db.get('users').find({ id: post.userId }).value() || { username: '[deleted]', id: null };
    const likes = db.get('likes').filter({ postId }).value() || [];
    const comments = db.get('comments').filter({ postId }).sortBy('timestamp').value() || [];
const commentsWithUser = comments.map(c => {
  const commentUser = db.get('users').find({ id: c.userId }).value() || { username: '[deleted]', avatar: null };
  return { ...c, username: commentUser.username, avatar: commentUser.avatar };
});
    const liked = req.session.userId ? likes.some(l => l.userId === req.session.userId) : false;

    res.render('post-detail', {
      post,
      user,
      likesCount: likes.length,
      liked,
      comments: commentsWithUser,
      currentUser: res.locals.currentUser
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('❌ Terjadi error');
  }
});

// ==================== INTERAKSI ====================

router.post('/like/:postId', isAuthenticated, (req, res) => {
  try {
    const postId = req.params.postId;
    const post = db.get('posts').find({ id: postId }).value();
    if (!post) return res.json({ success: false });

    const existing = db.get('likes')
      .find({ postId, userId: req.session.userId })
      .value();

    let liked = false;

    if (existing) {
      db.get('likes').remove(existing).write();
      liked = false;
    } else {
      db.get('likes').push({
        id: uuidv4(),
        postId,
        userId: req.session.userId,
        timestamp: Date.now()
      }).write();

      liked = true;

      if (post.userId !== req.session.userId) {
        db.get('notifications').push({
          id: uuidv4(),
          userId: post.userId,
          type: 'like',
          fromUserId: req.session.userId,
          postId: post.id,
          read: false,
          timestamp: Date.now()
        }).write();
      }
    }

    const likeCount = db.get('likes')
      .filter({ postId })
      .size()
      .value();

    res.json({ success: true, liked, likeCount });

  } catch (error) {
    console.error(error);
    res.json({ success: false });
  }
});

router.post('/comment/:postId', isAuthenticated, (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || !comment.trim())
      return res.json({ success: false });

    const postId = req.params.postId;
    const post = db.get('posts').find({ id: postId }).value();
    if (!post) return res.json({ success: false });

    const newComment = {
      id: uuidv4(),
      postId,
      userId: req.session.userId,
      text: comment.trim(),
      timestamp: Date.now()
    };

    db.get('comments').push(newComment).write();

    if (post.userId !== req.session.userId) {
      db.get('notifications').push({
        id: uuidv4(),
        userId: post.userId,
        type: 'comment',
        fromUserId: req.session.userId,
        postId: post.id,
        commentId: newComment.id,
        read: false,
        timestamp: Date.now()
      }).write();
    }

    res.json({ success: true, comment: newComment });

  } catch (error) {
    console.error(error);
    res.json({ success: false });
  }
});

router.post('/comment/delete/:commentId', isAuthenticated, (req, res) => {
  try {
    const commentId = req.params.commentId;
    const comment = db.get('comments').find({ id: commentId }).value();
    if (!comment) return res.json({ success: false });

    const post = db.get('posts').find({ id: comment.postId }).value();

    if (
      comment.userId === req.session.userId ||
      (post && post.userId === req.session.userId)
    ) {
      db.get('comments').remove({ id: commentId }).write();
      return res.json({ success: true });
    }

    res.json({ success: false });

  } catch (error) {
    console.error(error);
    res.json({ success: false });
  }
});

// ==================== FOLLOW SYSTEM ====================

// Follow/unfollow user
router.post('/follow/:userId', isAuthenticated, (req, res) => {
  try {
    const targetId = req.params.userId;
    console.log('🔍 Follow request received. targetId =', targetId);

    // Tolak jika targetId tidak valid
    if (!targetId || targetId === 'back' || targetId === 'undefined' || targetId === 'null' || targetId.trim() === '') {
      console.log('⛔ Invalid targetId, redirect back');
      // Jika request AJAX, kirim JSON error
      if (req.xhr) return res.json({ success: false, message: 'Invalid user ID' });
      return res.redirect('back');
    }

    // Cek apakah user target ada
    const targetUser = db.get('users').find({ id: targetId }).value();
    if (!targetUser) {
      console.log('⛔ Target user not found in DB:', targetId);
      if (req.xhr) return res.json({ success: false, message: 'User not found' });
      return res.redirect('back');
    }

    if (targetId === req.session.userId) {
      console.log('⛔ Cannot follow yourself');
      if (req.xhr) return res.json({ success: false, message: 'Cannot follow yourself' });
      return res.redirect('back');
    }

    const existing = db.get('follows').find({ followerId: req.session.userId, followingId: targetId }).value();

    if (existing) {
      db.get('follows').remove(existing).write();
      console.log('✅ Unfollow success:', targetId);
    } else {
      db.get('follows').push({ 
        id: uuidv4(),
        followerId: req.session.userId, 
        followingId: targetId,
        timestamp: Date.now()
      }).write();

      // Notifikasi
      db.get('notifications').push({
        id: uuidv4(),
        userId: targetId,
        type: 'follow',
        fromUserId: req.session.userId,
        read: false,
        timestamp: Date.now()
      }).write();

      console.log('✅ Follow success:', targetId);
    }

    // Hitung jumlah followers terbaru
    const followersCount = db.get('follows').filter({ followingId: targetId }).value().length;
const followingCount = db.get('follows')
  .filter({ followerId: req.session.userId })
  .value().length;

    // Jika request AJAX (fetch) -> kirim JSON
    if (req.xhr || req.headers.accept?.includes('application/json')) {
return res.json({
  success: true,
  following: !existing,
  followersCount,
  followingCount
});
    }

    // Jika bukan AJAX, redirect seperti biasa
    const referer = req.get('referer');
    if (referer && !referer.includes('/follow/')) {
      return res.redirect(referer);
    } else {
      return res.redirect('back');
    }
  } catch (error) {
    console.error('❌ Follow error:', error);
    if (req.xhr) return res.status(500).json({ success: false, message: 'Server error' });
    res.redirect('back');
  }
});

// ==================== PROFIL ====================

// Halaman edit profil
router.get('/profile/edit', isAuthenticated, (req, res) => {
  const user = db.get('users').find({ id: req.session.userId }).value();
  if (!user) {
    return res.redirect('/login');
  }
  res.render('edit-profile', { user, error: null });
});

// Proses edit profil
router.post('/profile/edit', isAuthenticated, async (req, res) => {
  try {
    const { bio, currentPassword, newPassword, confirmPassword } = req.body;
    const user = db.get('users').find({ id: req.session.userId }).value();
    
    if (!user) {
      return res.redirect('/login');
    }
    
    // Update bio
    if (bio !== undefined) {
      db.get('users').find({ id: req.session.userId })
        .assign({ bio: bio || 'Halo! Saya pengguna baru 👋' })
        .write();
    }
    
    // Ganti password jika diisi
    if (currentPassword && newPassword) {
      const validPassword = bcrypt.compareSync(currentPassword, user.password);
      if (!validPassword) {
        return res.render('edit-profile', { 
          user: { ...user, bio }, 
          error: '❌ Password saat ini salah' 
        });
      }
      
      if (newPassword.length < 6) {
        return res.render('edit-profile', { 
          user: { ...user, bio }, 
          error: '❌ Password baru minimal 6 karakter' 
        });
      }
      
      if (newPassword !== confirmPassword) {
        return res.render('edit-profile', { 
          user: { ...user, bio }, 
          error: '❌ Konfirmasi password tidak cocok' 
        });
      }
      
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(newPassword, salt);
      db.get('users').find({ id: req.session.userId })
        .assign({ password: hashedPassword })
        .write();
    }
    
    res.redirect('/profile/' + req.session.userId);
    
  } catch (error) {
    console.error(error);
    const user = db.get('users').find({ id: req.session.userId }).value();
    if (!user) {
      return res.redirect('/login');
    }
    res.render('edit-profile', { 
      user,
      error: '❌ Terjadi kesalahan server: ' + error.message 
    });
  }
});

// Halaman profil
/*router.get('/profile/:userId', (req, res) => {
  try {
    const profileUser = db.get('users').find({ id: req.params.userId }).value();
    
    if (!profileUser) {
      return res.status(404).render('error', { 
        message: '❌ User tidak ditemukan',
        backLink: '/'
      });
    }
    
    const posts = db.get('posts')
      .filter({ userId: profileUser.id })
      .sortBy('timestamp')
      .reverse()
      .value()
      .map(post => {
        const likes = db.get('likes').filter({ postId: post.id }).value() || [];
        const comments = db.get('comments').filter({ postId: post.id }).value() || [];
        return {
          ...post,
          likesCount: likes.length,
          commentsCount: comments.length,
          liked: req.session.userId ? likes.some(l => l.userId === req.session.userId) : false
        };
      });
    
    const followers = db.get('follows').filter({ followingId: profileUser.id }).value();
    const following = db.get('follows').filter({ followerId: profileUser.id }).value();
    const isFollowing = req.session.userId ? 
      db.get('follows').find({ followerId: req.session.userId, followingId: profileUser.id }).value() : 
      false;
    
    // Ambil followers dengan data user
    const followersWithData = followers.map(f => {
      const user = db.get('users').find({ id: f.followerId }).value();
      return user ? { id: user.id, username: user.username } : null;
    }).filter(u => u !== null);
    
    // Ambil following dengan data user
    const followingWithData = following.map(f => {
      const user = db.get('users').find({ id: f.followingId }).value();
      return user ? { id: user.id, username: user.username } : null;
    }).filter(u => u !== null);
    
    res.render('profile', {
      profileUser,
      posts,
      followersCount: followers.length,
      followingCount: following.length,
      followers: followersWithData,
      following: followingWithData,
      isFollowing,
      isOwnProfile: req.session.userId === profileUser.id
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).send('❌ Terjadi error');
  }
});*/

// Halaman profil
router.get('/profile/:userId', (req, res) => {
  try {
    const profileUser = db.get('users').find({ id: req.params.userId }).value();
    
    if (!profileUser) {
      return res.status(404).render('error', { 
        message: '❌ User tidak ditemukan',
        backLink: '/'
      });
    }
    
    const posts = db.get('posts')
      .filter({ userId: profileUser.id })
      .sortBy('timestamp')
      .reverse()
      .value()
      .map(post => {
        const likes = db.get('likes').filter({ postId: post.id }).value() || [];
        const comments = db.get('comments').filter({ postId: post.id }).value() || [];
        return {
          ...post,
          likesCount: likes.length,
          commentsCount: comments.length,
          liked: req.session.userId ? likes.some(l => l.userId === req.session.userId) : false
        };
      });
    
    const followers = db.get('follows').filter({ followingId: profileUser.id }).value();
    const following = db.get('follows').filter({ followerId: profileUser.id }).value();
    const isFollowing = req.session.userId ? 
      db.get('follows').find({ followerId: req.session.userId, followingId: profileUser.id }).value() : 
      false;
    
    // Ambil followers dengan data user (termasuk avatar)
    const followersWithData = followers.map(f => {
      const user = db.get('users').find({ id: f.followerId }).value();
      if (!user) return null;
      return {
        id: user.id,
        username: user.username,
        avatar: user.avatar || null,
        isFollowed: req.session.userId ? 
          db.get('follows').find({ followerId: req.session.userId, followingId: user.id }).value() : false
      };
    }).filter(u => u !== null);
    
    // Ambil following dengan data user (termasuk avatar)
    const followingWithData = following.map(f => {
      const user = db.get('users').find({ id: f.followingId }).value();
      if (!user) return null;
      return {
        id: user.id,
        username: user.username,
        avatar: user.avatar || null,
        isFollowedByMe: req.session.userId ? 
          db.get('follows').find({ followerId: req.session.userId, followingId: user.id }).value() : false
      };
    }).filter(u => u !== null);
    
    res.render('profile', {
      profileUser,
      posts,
      followersCount: followers.length,
      followingCount: following.length,
      followers: followersWithData,
      following: followingWithData,
      isFollowing,
      isOwnProfile: req.session.userId === profileUser.id,
      currentUser: req.session.userId ? { id: req.session.userId } : null // tambahkan jika diperlukan
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).send('❌ Terjadi error');
  }
});

// ==================== NOTIFIKASI ====================

// Halaman notifikasi
router.get('/notifications', isAuthenticated, (req, res) => {
  const notifications = db.get('notifications')
    .filter({ userId: req.session.userId })
    .sortBy('timestamp')
    .reverse()
    .value()
    .map(notif => {
      const fromUser = db.get('users').find({ id: notif.fromUserId }).value() || { username: '[deleted]' };
      let post = null;
      if (notif.postId) {
        post = db.get('posts').find({ id: notif.postId }).value();
      }
      return { ...notif, fromUser, post };
    });
  
  // Tandai semua sebagai sudah dibaca
  db.get('notifications')
    .filter({ userId: req.session.userId, read: false })
    .each(n => { n.read = true; })
    .write();
  
  res.render('notifications', { notifications });
});

// Hapus notifikasi
router.post('/notifications/clear', isAuthenticated, (req, res) => {
  db.get('notifications').remove({ userId: req.session.userId }).write();
  res.redirect('/notifications');
});

// ==================== PENCARIAN ====================

// Halaman pencarian
router.get('/search', (req, res) => {
  const { q } = req.query;
  let results = { users: [], posts: [] };

  if (q && q.trim()) {
    const query = q.toLowerCase().trim();
    
    // Cari user dan tambahkan status follow
    let users = db.get('users')
      .filter(u => u.username.toLowerCase().includes(query))
      .value();
    
    // Tambahkan isFollowing untuk setiap user (jika ada currentUser)
    if (req.session.userId) {
      users = users.map(u => {
        const isFollowing = db.get('follows').find({ 
          followerId: req.session.userId, 
          followingId: u.id 
        }).value() ? true : false;
        return { ...u, isFollowing };
      });
    } else {
      users = users.map(u => ({ ...u, isFollowing: false }));
    }
    
    results.users = users;
    
    // Cari postingan berdasarkan caption
    results.posts = db.get('posts')
      .filter(p => p.caption && p.caption.toLowerCase().includes(query))
      .sortBy('timestamp')
      .reverse()
      .value()
      .map(post => {
        const user = db.get('users').find({ id: post.userId }).value() || { username: '[deleted]' };
        const likes = db.get('likes').filter({ postId: post.id }).value() || [];
        const comments = db.get('comments').filter({ postId: post.id }).value() || [];
        return { 
          ...post, 
          user,
          likesCount: likes.length,
          commentsCount: comments.length
        };
      });
  }
  
  res.render('search', { 
    query: q, 
    results,
    currentUser: res.locals.currentUser || null
  });
});

// ==================== PP USER ====================

// Upload avatar
/*router.post('/profile/avatar', isAuthenticated, uploadAvatar.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      if (req.xhr) return res.status(400).json({ success: false, message: 'Tidak ada file' });
      return res.redirect('/profile/edit?error=no_file');
    }
    const avatarUrl = '/avatars/' + req.file.filename;
    db.get('users').find({ id: req.session.userId })
      .assign({ avatar: avatarUrl })
      .write();

    if (req.xhr) {
      return res.json({ success: true, avatarUrl });
    } else {
      res.redirect('/profile/' + req.session.userId);
    }
  } catch (error) {
    console.error(error);
    if (req.xhr) return res.status(500).json({ success: false, message: 'Upload gagal' });
    res.redirect('/profile/edit?error=upload_failed');
  }
});

// Hapus avatar
router.post('/profile/avatar/delete', isAuthenticated, (req, res) => {
  try {
    const user = db.get('users').find({ id: req.session.userId }).value();
    if (user && user.avatar) {
      const filePath = path.join(__dirname, '../public', user.avatar);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      db.get('users').find({ id: req.session.userId })
        .assign({ avatar: null })
        .write();
    }
    if (req.xhr) {
      return res.json({ success: true });
    } else {
      res.redirect('/profile/' + req.session.userId);
    }
  } catch (error) {
    console.error(error);
    if (req.xhr) return res.status(500).json({ success: false, message: 'Hapus gagal' });
    res.redirect('/profile/edit?error=delete_failed');
  }
});*/

// Upload avatar
router.post('/profile/avatar', isAuthenticated, uploadAvatar.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.redirect('/profile/edit?error=no_file');

    const avatarUrl = '/avatars/' + req.file.filename;

    await db.get('users')
      .find({ id: req.session.userId })
      .assign({ avatar: avatarUrl })
      .write();

    res.redirect('/profile/' + req.session.userId);
  } catch (error) {
    console.error(error);
    res.redirect('/profile/edit?error=upload_failed');
  }
});

// Hapus avatar
router.post('/profile/avatar/delete', isAuthenticated, async (req, res) => {
  try {
    const user = db.get('users').find({ id: req.session.userId }).value();
    if (user && user.avatar) {
      const filePath = path.join(__dirname, '../public', user.avatar);
      try {
        await fsp.unlink(filePath);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }

      await db.get('users')
        .find({ id: req.session.userId })
        .assign({ avatar: null })
        .write();
    }

    res.redirect('/profile/' + req.session.userId);
  } catch (error) {
    console.error(error);
    res.redirect('/profile/edit?error=delete_failed');
  }
});

module.exports = router;