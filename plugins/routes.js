const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { upload, uploadAvatar, uploadToBlob, deleteFromBlob } = require('../lib/upload');
const User = require('../models/User');
const Post = require('../models/Post');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Follow = require('../models/Follow');
const Notification = require('../models/Notification');

// Helper untuk generate ObjectId
const generateObjectId = () => new mongoose.Types.ObjectId();

// Middleware untuk mengecek login
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
};

// Middleware untuk menyediakan data user ke semua view
router.use(async (req, res, next) => {
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
    try {
      // Pastikan userId adalah ObjectId yang valid
      const userId = req.session.userId;
      const user = await User.findById(userId).lean();
      
      if (!user) {
        req.session.destroy();
        return res.redirect('/login');
      }
      res.locals.currentUser = user;
    } catch (error) {
      console.error('Error loading user:', error);
      req.session.destroy();
      return res.redirect('/login');
    }
  }
  next();
});

// ==================== AUTHENTICATION ====================

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  const error = req.query.error;
  let errorMessage = null;
  if (error === 'user_not_found') errorMessage = '❌ Sesi tidak valid, silakan login ulang.';
  else if (error === 'session_expired') errorMessage = '⏰ Sesi berakhir, silakan login ulang.';
  res.render('login', { error: errorMessage });
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.render('login', { error: '❌ Username dan password wajib diisi' });
    }
    
    const user = await User.findOne({ username }).lean();
    
    if (!user) {
      return res.render('login', { error: '❌ Username tidak ditemukan' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.render('login', { error: '❌ Password salah' });
    }
    
    req.session.userId = user._id;
    
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
    
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: '❌ Terjadi kesalahan server: ' + error.message });
  }
});

router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
  try {
    const { username, password, confirmPassword, bio } = req.body;
    
    if (!username || !password) {
      return res.render('register', { error: '❌ Username dan password wajib diisi' });
    }
    
    if (password.length < 6) {
      return res.render('register', { error: '❌ Password minimal 6 karakter' });
    }
    
    if (password !== confirmPassword) {
      return res.render('register', { error: '❌ Konfirmasi password tidak cocok' });
    }
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.render('register', { error: '❌ Username sudah digunakan' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = new User({
      username,
      password: hashedPassword,
      bio: bio || 'Halo! Saya pengguna baru 👋',
      avatar: null,
      createdAt: new Date()
    });
    
    await newUser.save();
    
    req.session.userId = newUser._id;
    res.redirect('/profile/' + newUser._id);
    
  } catch (error) {
    console.error('Register error:', error);
    res.render('register', { error: '❌ Terjadi kesalahan server: ' + error.message });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/login');
  });
});

// ==================== HALAMAN UTAMA ====================

router.get('/', async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ timestamp: -1 })
      .lean();
    
    const postsWithData = await Promise.all(posts.map(async (post) => {
      const user = await User.findById(post.userId).lean() || { username: '[deleted]', _id: null };
      const likesCount = await Like.countDocuments({ postId: post._id });
      const comments = await Comment.find({ postId: post._id })
        .sort({ timestamp: 1 })
        .lean();
      
      const commentsWithUser = await Promise.all(comments.map(async (c) => {
        const commentUser = await User.findById(c.userId).lean() || { username: '[deleted]', avatar: null };
        return { 
          ...c, 
          username: commentUser.username, 
          avatar: commentUser.avatar,
          _id: c._id
        };
      }));
      
      const liked = req.session.userId ? 
        !!(await Like.findOne({ postId: post._id, userId: req.session.userId })) : 
        false;
      
      return {
        ...post,
        _id: post._id,
        user,
        likesCount,
        liked,
        comments: commentsWithUser
      };
    }));
    
    res.render('index', { posts: postsWithData });
  } catch (error) {
    console.error('Home error:', error);
    res.status(500).send('❌ Terjadi error: ' + error.message);
  }
});

// ==================== POSTINGAN ====================

router.get('/upload', isAuthenticated, (req, res) => {
  res.render('upload', { error: null });
});

router.post('/upload', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    const { caption } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.render('upload', { error: '❌ Pilih file terlebih dahulu' });
    }
    
    const mediaUrl = await uploadToBlob(file, 'uploads');
    
    let fileType = 'other';
    if (file.mimetype.startsWith('image/')) fileType = 'image';
    else if (file.mimetype.startsWith('video/')) fileType = 'video';
    else if (file.mimetype.startsWith('audio/')) fileType = 'audio';
    else if (file.mimetype === 'image/gif') fileType = 'gif';
    
    const post = new Post({
      userId: req.session.userId,
      mediaUrl,
      mediaType: fileType,
      mimeType: file.mimetype,
      caption: caption || '',
      timestamp: new Date(),
      size: file.size
    });
    
    await post.save();
    
    // Buat notifikasi untuk followers
    const followers = await Follow.find({ followingId: req.session.userId }).lean();
    
    for (const follower of followers) {
      const notification = new Notification({
        userId: follower.followerId,
        type: 'new_post',
        fromUserId: req.session.userId,
        postId: post._id,
        read: false,
        timestamp: new Date()
      });
      await notification.save();
    }
    
    res.redirect('/profile/' + req.session.userId);
  } catch (error) {
    console.error('Upload error:', error);
    res.render('upload', { error: '❌ Gagal upload: ' + error.message });
  }
});

router.post('/post/delete/:postId', isAuthenticated, async (req, res) => {
  try {
    const postId = req.params.postId;
    
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.redirect('back');
    }
    
    const post = await Post.findById(postId);
    
    if (!post) return res.redirect('back');
    if (post.userId.toString() !== req.session.userId) return res.redirect('back');
    
    if (post.mediaUrl) {
      await deleteFromBlob(post.mediaUrl);
    }
    
    await Post.deleteOne({ _id: postId });
    await Like.deleteMany({ postId });
    await Comment.deleteMany({ postId });
    
    res.redirect('/profile/' + req.session.userId);
  } catch (error) {
    console.error('Delete post error:', error);
    res.redirect('back');
  }
});

router.get('/post/:postId', async (req, res) => {
  try {
    const postId = req.params.postId;
    
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(404).render('error', { 
        message: 'Postingan tidak ditemukan', 
        backLink: '/' 
      });
    }
    
    const post = await Post.findById(postId).lean();
    
    if (!post) {
      return res.status(404).render('error', { 
        message: 'Postingan tidak ditemukan', 
        backLink: '/' 
      });
    }
    
    const user = await User.findById(post.userId).lean() || { username: '[deleted]', _id: null };
    const likesCount = await Like.countDocuments({ postId });
    const comments = await Comment.find({ postId })
      .sort({ timestamp: 1 })
      .lean();
    
    const commentsWithUser = await Promise.all(comments.map(async (c) => {
      const commentUser = await User.findById(c.userId).lean() || { username: '[deleted]', avatar: null };
      return { 
        ...c, 
        username: commentUser.username, 
        avatar: commentUser.avatar,
        _id: c._id
      };
    }));
    
    const liked = req.session.userId ? 
      !!(await Like.findOne({ postId, userId: req.session.userId })) : 
      false;
    
    res.render('post-detail', {
      post,
      user,
      likesCount,
      liked,
      comments: commentsWithUser,
      currentUser: res.locals.currentUser
    });
  } catch (error) {
    console.error('Post detail error:', error);
    res.status(500).send('❌ Terjadi error: ' + error.message);
  }
});

// ==================== INTERAKSI ====================

router.post('/like/:postId', isAuthenticated, async (req, res) => {
  try {
    const postId = req.params.postId;
    
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }
    
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    
    const existing = await Like.findOne({ 
      postId, 
      userId: req.session.userId 
    });
    
    let liked = false;
    
    if (existing) {
      await Like.deleteOne({ _id: existing._id });
      liked = false;
    } else {
      const newLike = new Like({
        postId,
        userId: req.session.userId,
        timestamp: new Date()
      });
      await newLike.save();
      liked = true;
      
      if (post.userId.toString() !== req.session.userId) {
        const notification = new Notification({
          userId: post.userId,
          type: 'like',
          fromUserId: req.session.userId,
          postId: post._id,
          read: false,
          timestamp: new Date()
        });
        await notification.save();
      }
    }
    
    const likeCount = await Like.countDocuments({ postId });
    res.json({ success: true, liked, likeCount });
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/comment/:postId', isAuthenticated, async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ success: false, message: 'Comment cannot be empty' });
    }
    
    const postId = req.params.postId;
    
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }
    
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    
    const newComment = new Comment({
      postId,
      userId: req.session.userId,
      text: comment.trim(),
      timestamp: new Date()
    });
    
    await newComment.save();
    
    if (post.userId.toString() !== req.session.userId) {
      const notification = new Notification({
        userId: post.userId,
        type: 'comment',
        fromUserId: req.session.userId,
        postId: post._id,
        commentId: newComment._id,
        read: false,
        timestamp: new Date()
      });
      await notification.save();
    }
    
    // Get user data for response
    const user = await User.findById(req.session.userId).lean();
    const commentData = {
      ...newComment.toObject(),
      username: user.username,
      avatar: user.avatar
    };
    
    res.json({ success: true, comment: commentData });
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/comment/delete/:commentId', isAuthenticated, async (req, res) => {
  try {
    const commentId = req.params.commentId;
    
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.json({ success: false });
    }
    
    const comment = await Comment.findById(commentId);
    if (!comment) return res.json({ success: false });
    
    const post = await Post.findById(comment.postId);
    
    if (comment.userId.toString() === req.session.userId || 
        (post && post.userId.toString() === req.session.userId)) {
      await Comment.deleteOne({ _id: commentId });
      return res.json({ success: true });
    }
    
    res.json({ success: false });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.json({ success: false });
  }
});

// ==================== FOLLOW SYSTEM ====================

router.post('/follow/:userId', isAuthenticated, async (req, res) => {
  try {
    const targetId = req.params.userId;
    
    if (!targetId || targetId === 'back' || targetId === 'undefined' || 
        targetId === 'null' || targetId.trim() === '') {
      if (req.xhr) return res.json({ success: false, message: 'Invalid user ID' });
      return res.redirect('back');
    }
    
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      if (req.xhr) return res.json({ success: false, message: 'Invalid user ID format' });
      return res.redirect('back');
    }
    
    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      if (req.xhr) return res.json({ success: false, message: 'User not found' });
      return res.redirect('back');
    }
    
    if (targetId === req.session.userId) {
      if (req.xhr) return res.json({ success: false, message: 'Cannot follow yourself' });
      return res.redirect('back');
    }
    
    const existing = await Follow.findOne({ 
      followerId: req.session.userId, 
      followingId: targetId 
    });
    
    let isFollowing = false;
    
    if (existing) {
      await Follow.deleteOne({ _id: existing._id });
      isFollowing = false;
    } else {
      const newFollow = new Follow({
        followerId: req.session.userId,
        followingId: targetId,
        timestamp: new Date()
      });
      await newFollow.save();
      isFollowing = true;
      
      const notification = new Notification({
        userId: targetId,
        type: 'follow',
        fromUserId: req.session.userId,
        read: false,
        timestamp: new Date()
      });
      await notification.save();
    }
    
    const followersCount = await Follow.countDocuments({ followingId: targetId });
    const followingCount = await Follow.countDocuments({ followerId: req.session.userId });
    
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ 
        success: true, 
        following: isFollowing, 
        followersCount, 
        followingCount 
      });
    }
    
    const referer = req.get('referer');
    if (referer && !referer.includes('/follow/')) {
      return res.redirect(referer);
    } else {
      return res.redirect('back');
    }
  } catch (error) {
    console.error('Follow error:', error);
    if (req.xhr) return res.status(500).json({ success: false, message: 'Server error' });
    res.redirect('back');
  }
});

// ==================== PROFIL ====================

router.get('/profile/edit', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) return res.redirect('/login');
    res.render('edit-profile', { user: user.toObject(), error: null });
  } catch (error) {
    console.error('Edit profile error:', error);
    res.redirect('/login');
  }
});

router.post('/profile/edit', isAuthenticated, async (req, res) => {
  try {
    const { bio, currentPassword, newPassword, confirmPassword } = req.body;
    const user = await User.findById(req.session.userId);
    
    if (!user) return res.redirect('/login');
    
    // Update bio
    if (bio !== undefined) {
      user.bio = bio || 'Halo! Saya pengguna baru 👋';
      await user.save();
    }
    
    // Ganti password jika diisi
    if (currentPassword && newPassword) {
      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.render('edit-profile', { 
          user: { ...user.toObject(), bio }, 
          error: '❌ Password saat ini salah' 
        });
      }
      
      if (newPassword.length < 6) {
        return res.render('edit-profile', { 
          user: { ...user.toObject(), bio }, 
          error: '❌ Password baru minimal 6 karakter' 
        });
      }
      
      if (newPassword !== confirmPassword) {
        return res.render('edit-profile', { 
          user: { ...user.toObject(), bio }, 
          error: '❌ Konfirmasi password tidak cocok' 
        });
      }
      
      user.password = await bcrypt.hash(newPassword, 10);
      await user.save();
    }
    
    res.redirect('/profile/' + req.session.userId);
  } catch (error) {
    console.error('Edit profile error:', error);
    const user = await User.findById(req.session.userId);
    if (!user) return res.redirect('/login');
    res.render('edit-profile', { 
      user: user.toObject(), 
      error: '❌ Terjadi kesalahan server: ' + error.message 
    });
  }
});

router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(404).render('error', { 
        message: '❌ User ID tidak valid',
        backLink: '/'
      });
    }
    
    const profileUser = await User.findById(userId).lean();
    
    if (!profileUser) {
      return res.status(404).render('error', { 
        message: '❌ User tidak ditemukan',
        backLink: '/'
      });
    }
    
    const posts = await Post.find({ userId: profileUser._id })
      .sort({ timestamp: -1 })
      .lean();
    
    const postsWithStats = await Promise.all(posts.map(async (post) => {
      const likesCount = await Like.countDocuments({ postId: post._id });
      const commentsCount = await Comment.countDocuments({ postId: post._id });
      const liked = req.session.userId ? 
        !!(await Like.findOne({ postId: post._id, userId: req.session.userId })) : 
        false;
      
      return { 
        ...post, 
        likesCount, 
        commentsCount, 
        liked 
      };
    }));
    
    const followers = await Follow.find({ followingId: profileUser._id }).lean();
    const following = await Follow.find({ followerId: profileUser._id }).lean();
    const isFollowing = req.session.userId ? 
      !!(await Follow.findOne({ followerId: req.session.userId, followingId: profileUser._id })) : 
      false;
    
    // Ambil followers dengan data user
    const followersWithData = await Promise.all(followers.map(async (f) => {
      const user = await User.findById(f.followerId).lean();
      if (!user) return null;
      const isFollowed = req.session.userId ? 
        !!(await Follow.findOne({ followerId: req.session.userId, followingId: user._id })) : 
        false;
      return {
        id: user._id,
        username: user.username,
        avatar: user.avatar,
        isFollowed
      };
    }));
    
    // Ambil following dengan data user
    const followingWithData = await Promise.all(following.map(async (f) => {
      const user = await User.findById(f.followingId).lean();
      if (!user) return null;
      const isFollowedByMe = req.session.userId ? 
        !!(await Follow.findOne({ followerId: req.session.userId, followingId: user._id })) : 
        false;
      return {
        id: user._id,
        username: user.username,
        avatar: user.avatar,
        isFollowedByMe
      };
    }));
    
    res.render('profile', {
      profileUser,
      posts: postsWithStats,
      followersCount: followers.length,
      followingCount: following.length,
      followers: followersWithData.filter(v => v),
      following: followingWithData.filter(v => v),
      isFollowing,
      isOwnProfile: req.session.userId ? req.session.userId.toString() === profileUser._id.toString() : false,
      currentUser: req.session.userId ? { _id: req.session.userId } : null
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).send('❌ Terjadi error: ' + error.message);
  }
});

// ==================== NOTIFIKASI ====================

router.get('/notifications', isAuthenticated, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.session.userId })
      .sort({ timestamp: -1 })
      .lean();
    
    const notificationsWithData = await Promise.all(notifications.map(async (notif) => {
      const fromUser = await User.findById(notif.fromUserId).lean() || { username: '[deleted]' };
      let post = null;
      if (notif.postId) {
        post = await Post.findById(notif.postId).lean();
      }
      return { ...notif, fromUser, post };
    }));
    
    // Tandai semua sebagai sudah dibaca
    await Notification.updateMany(
      { userId: req.session.userId, read: false }, 
      { $set: { read: true } }
    );
    
    res.render('notifications', { notifications: notificationsWithData });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).send('Error loading notifications');
  }
});

router.post('/notifications/clear', isAuthenticated, async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.session.userId });
    res.redirect('/notifications');
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.redirect('/notifications');
  }
});

// ==================== PENCARIAN ====================

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    let results = { users: [], posts: [] };
    
    if (q && q.trim()) {
      const query = q.toLowerCase().trim();
      
      // Cari user dengan regex (case insensitive)
      let users = await User.find({ 
        username: { $regex: query, $options: 'i' } 
      }).lean();
      
      // Tambahkan status follow
      if (req.session.userId) {
        users = await Promise.all(users.map(async (u) => {
          const isFollowing = !!(await Follow.findOne({ 
            followerId: req.session.userId, 
            followingId: u._id 
          }));
          return { ...u, isFollowing };
        }));
      } else {
        users = users.map(u => ({ ...u, isFollowing: false }));
      }
      
      results.users = users;
      
      // Cari postingan berdasarkan caption
      const posts = await Post.find({ 
        caption: { $regex: query, $options: 'i' } 
      })
        .sort({ timestamp: -1 })
        .lean();
      
      results.posts = await Promise.all(posts.map(async (post) => {
        const user = await User.findById(post.userId).lean() || { username: '[deleted]' };
        const likesCount = await Like.countDocuments({ postId: post._id });
        const commentsCount = await Comment.countDocuments({ postId: post._id });
        return { ...post, user, likesCount, commentsCount };
      }));
    }
    
    res.render('search', { 
      query: q, 
      results,
      currentUser: res.locals.currentUser || null
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).send('Error searching');
  }
});

// ==================== AVATAR ====================

router.post('/profile/avatar', isAuthenticated, uploadAvatar.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.redirect('/profile/edit?error=no_file');
    
    const avatarUrl = await uploadToBlob(req.file, 'avatars');
    const user = await User.findById(req.session.userId);
    
    if (user.avatar) {
      await deleteFromBlob(user.avatar);
    }
    
    user.avatar = avatarUrl;
    await user.save();
    
    res.redirect('/profile/' + req.session.userId);
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.redirect('/profile/edit?error=upload_failed');
  }
});

router.post('/profile/avatar/delete', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    
    if (user && user.avatar) {
      await deleteFromBlob(user.avatar);
      user.avatar = null;
      await user.save();
    }
    
    res.redirect('/profile/' + req.session.userId);
  } catch (error) {
    console.error('Avatar delete error:', error);
    res.redirect('/profile/edit?error=delete_failed');
  }
});

module.exports = router;