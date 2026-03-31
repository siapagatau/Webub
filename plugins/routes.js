const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { upload, uploadAvatar, uploadToBlob, deleteFromBlob } = require('../lib/upload');
const User = require('../models/User');
const Post = require('../models/Post');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Follow = require('../models/Follow');
const Notification = require('../models/Notification');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // masih diperlukan untuk id sementara? sebenarnya MongoDB pakai _id, tapi kita tetap pakai uuid untuk id string

// Helper untuk mendapatkan user by id (string)
const getUserById = async (id) => {
  return await User.findOne({ id });
};

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
    const user = await User.findOne({ id: req.session.userId });
    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }
    res.locals.currentUser = user;
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
    const user = await User.findOne({ username });
    if (!user) {
      return res.render('login', { error: '❌ Username tidak ditemukan' });
    }
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.render('login', { error: '❌ Password salah' });
    }
    req.session.userId = user.id;
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
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    const newUser = new User({
      id: uuidv4(),
      username,
      password: hashedPassword,
      bio: bio || 'Halo! Saya pengguna baru 👋',
      avatar: null,
      createdAt: new Date()
    });
    await newUser.save();
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

router.get('/', async (req, res) => {
  try {
    const posts = await Post.find().sort({ timestamp: -1 }).lean();
    const postsWithData = await Promise.all(posts.map(async (post) => {
      const user = await User.findOne({ id: post.userId }).lean() || { username: '[deleted]', id: null };
      const likes = await Like.find({ postId: post.id }).lean();
      const comments = await Comment.find({ postId: post.id }).sort({ timestamp: 1 }).lean();
      const commentsWithUser = await Promise.all(comments.map(async (c) => {
        const commentUser = await User.findOne({ id: c.userId }).lean() || { username: '[deleted]', avatar: null };
        return { ...c, username: commentUser.username, avatar: commentUser.avatar };
      }));
      const liked = req.session.userId ? likes.some(l => l.userId === req.session.userId) : false;
      return {
        ...post,
        user,
        likesCount: likes.length,
        liked,
        comments: commentsWithUser
      };
    }));
    res.render('index', { posts: postsWithData });
  } catch (error) {
    console.error(error);
    res.status(500).send('❌ Terjadi error');
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
    // Upload ke Vercel Blob
    const mediaUrl = await uploadToBlob(file, 'uploads');
    let fileType = 'other';
    if (file.mimetype.startsWith('image/')) fileType = 'image';
    else if (file.mimetype.startsWith('video/')) fileType = 'video';
    else if (file.mimetype.startsWith('audio/')) fileType = 'audio';
    else if (file.mimetype === 'image/gif') fileType = 'gif';
    const post = new Post({
      id: uuidv4(),
      userId: req.session.userId,
      mediaUrl,
      mediaType: fileType,
      mimeType: file.mimetype,
      caption: caption || '',
      timestamp: new Date(),
      size: file.size
    });
    await post.save();
    // Notifikasi ke followers
    const followers = await Follow.find({ followingId: req.session.userId }).lean();
    for (const f of followers) {
      const notif = new Notification({
        id: uuidv4(),
        userId: f.followerId,
        type: 'new_post',
        fromUserId: req.session.userId,
        postId: post.id,
        read: false,
        timestamp: new Date()
      });
      await notif.save();
    }
    res.redirect('/profile/' + req.session.userId);
  } catch (error) {
    console.error(error);
    res.render('upload', { error: '❌ Gagal upload: ' + error.message });
  }
});

router.post('/post/delete/:postId', isAuthenticated, async (req, res) => {
  try {
    const postId = req.params.postId;
    const post = await Post.findOne({ id: postId });
    if (!post) return res.redirect('back');
    if (post.userId !== req.session.userId) return res.redirect('back');
    // Hapus file dari blob
    if (post.mediaUrl) {
      await deleteFromBlob(post.mediaUrl);
    }
    // Hapus dari database
    await Post.deleteOne({ id: postId });
    await Like.deleteMany({ postId });
    await Comment.deleteMany({ postId });
    res.redirect('/profile/' + req.session.userId);
  } catch (error) {
    console.error(error);
    res.redirect('back');
  }
});

router.get('/post/:postId', async (req, res) => {
  try {
    const postId = req.params.postId;
    const post = await Post.findOne({ id: postId }).lean();
    if (!post) {
      return res.status(404).render('error', { message: 'Postingan tidak ditemukan', backLink: '/' });
    }
    const user = await User.findOne({ id: post.userId }).lean() || { username: '[deleted]', id: null };
    const likes = await Like.find({ postId }).lean();
    const comments = await Comment.find({ postId }).sort({ timestamp: 1 }).lean();
    const commentsWithUser = await Promise.all(comments.map(async (c) => {
      const commentUser = await User.findOne({ id: c.userId }).lean() || { username: '[deleted]', avatar: null };
      return { ...c, username: commentUser.username, avatar: commentUser.avatar };
    }));
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

router.post('/like/:postId', isAuthenticated, async (req, res) => {
  try {
    const postId = req.params.postId;
    const post = await Post.findOne({ id: postId });
    if (!post) return res.json({ success: false });
    const existing = await Like.findOne({ postId, userId: req.session.userId });
    let liked = false;
    if (existing) {
      await Like.deleteOne({ _id: existing._id });
      liked = false;
    } else {
      const newLike = new Like({
        id: uuidv4(),
        postId,
        userId: req.session.userId,
        timestamp: new Date()
      });
      await newLike.save();
      liked = true;
      if (post.userId !== req.session.userId) {
        const notif = new Notification({
          id: uuidv4(),
          userId: post.userId,
          type: 'like',
          fromUserId: req.session.userId,
          postId: post.id,
          read: false,
          timestamp: new Date()
        });
        await notif.save();
      }
    }
    const likeCount = await Like.countDocuments({ postId });
    res.json({ success: true, liked, likeCount });
  } catch (error) {
    console.error(error);
    res.json({ success: false });
  }
});

router.post('/comment/:postId', isAuthenticated, async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || !comment.trim()) return res.json({ success: false });
    const postId = req.params.postId;
    const post = await Post.findOne({ id: postId });
    if (!post) return res.json({ success: false });
    const newComment = new Comment({
      id: uuidv4(),
      postId,
      userId: req.session.userId,
      text: comment.trim(),
      timestamp: new Date()
    });
    await newComment.save();
    if (post.userId !== req.session.userId) {
      const notif = new Notification({
        id: uuidv4(),
        userId: post.userId,
        type: 'comment',
        fromUserId: req.session.userId,
        postId: post.id,
        commentId: newComment.id,
        read: false,
        timestamp: new Date()
      });
      await notif.save();
    }
    res.json({ success: true, comment: newComment });
  } catch (error) {
    console.error(error);
    res.json({ success: false });
  }
});

router.post('/comment/delete/:commentId', isAuthenticated, async (req, res) => {
  try {
    const commentId = req.params.commentId;
    const comment = await Comment.findOne({ id: commentId });
    if (!comment) return res.json({ success: false });
    const post = await Post.findOne({ id: comment.postId });
    if (comment.userId === req.session.userId || (post && post.userId === req.session.userId)) {
      await Comment.deleteOne({ id: commentId });
      return res.json({ success: true });
    }
    res.json({ success: false });
  } catch (error) {
    console.error(error);
    res.json({ success: false });
  }
});

// ==================== FOLLOW SYSTEM ====================

router.post('/follow/:userId', isAuthenticated, async (req, res) => {
  try {
    const targetId = req.params.userId;
    if (!targetId || targetId === 'back' || targetId === 'undefined' || targetId === 'null' || targetId.trim() === '') {
      if (req.xhr) return res.json({ success: false, message: 'Invalid user ID' });
      return res.redirect('back');
    }
    const targetUser = await User.findOne({ id: targetId });
    if (!targetUser) {
      if (req.xhr) return res.json({ success: false, message: 'User not found' });
      return res.redirect('back');
    }
    if (targetId === req.session.userId) {
      if (req.xhr) return res.json({ success: false, message: 'Cannot follow yourself' });
      return res.redirect('back');
    }
    const existing = await Follow.findOne({ followerId: req.session.userId, followingId: targetId });
    let isFollowing = false;
    if (existing) {
      await Follow.deleteOne({ _id: existing._id });
      isFollowing = false;
    } else {
      const newFollow = new Follow({
        id: uuidv4(),
        followerId: req.session.userId,
        followingId: targetId,
        timestamp: new Date()
      });
      await newFollow.save();
      isFollowing = true;
      const notif = new Notification({
        id: uuidv4(),
        userId: targetId,
        type: 'follow',
        fromUserId: req.session.userId,
        read: false,
        timestamp: new Date()
      });
      await notif.save();
    }
    const followersCount = await Follow.countDocuments({ followingId: targetId });
    const followingCount = await Follow.countDocuments({ followerId: req.session.userId });
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, following: isFollowing, followersCount, followingCount });
    }
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

router.get('/profile/edit', isAuthenticated, async (req, res) => {
  const user = await User.findOne({ id: req.session.userId });
  if (!user) return res.redirect('/login');
  res.render('edit-profile', { user, error: null });
});

router.post('/profile/edit', isAuthenticated, async (req, res) => {
  try {
    const { bio, currentPassword, newPassword, confirmPassword } = req.body;
    const user = await User.findOne({ id: req.session.userId });
    if (!user) return res.redirect('/login');
    if (bio !== undefined) {
      user.bio = bio || 'Halo! Saya pengguna baru 👋';
      await user.save();
    }
    if (currentPassword && newPassword) {
      const valid = bcrypt.compareSync(currentPassword, user.password);
      if (!valid) {
        return res.render('edit-profile', { user: { ...user.toObject(), bio }, error: '❌ Password saat ini salah' });
      }
      if (newPassword.length < 6) {
        return res.render('edit-profile', { user: { ...user.toObject(), bio }, error: '❌ Password baru minimal 6 karakter' });
      }
      if (newPassword !== confirmPassword) {
        return res.render('edit-profile', { user: { ...user.toObject(), bio }, error: '❌ Konfirmasi password tidak cocok' });
      }
      const salt = bcrypt.genSaltSync(10);
      user.password = bcrypt.hashSync(newPassword, salt);
      await user.save();
    }
    res.redirect('/profile/' + req.session.userId);
  } catch (error) {
    console.error(error);
    const user = await User.findOne({ id: req.session.userId });
    if (!user) return res.redirect('/login');
    res.render('edit-profile', { user, error: '❌ Terjadi kesalahan server: ' + error.message });
  }
});

router.get('/profile/:userId', async (req, res) => {
  try {
    const profileUser = await User.findOne({ id: req.params.userId });
    if (!profileUser) {
      return res.status(404).render('error', { message: '❌ User tidak ditemukan', backLink: '/' });
    }
    const posts = await Post.find({ userId: profileUser.id }).sort({ timestamp: -1 }).lean();
    const postsWithStats = await Promise.all(posts.map(async (post) => {
      const likes = await Like.countDocuments({ postId: post.id });
      const comments = await Comment.countDocuments({ postId: post.id });
      const liked = req.session.userId ? !!(await Like.findOne({ postId: post.id, userId: req.session.userId })) : false;
      return { ...post, likesCount: likes, commentsCount: comments, liked };
    }));
    const followers = await Follow.find({ followingId: profileUser.id }).lean();
    const following = await Follow.find({ followerId: profileUser.id }).lean();
    const isFollowing = req.session.userId ? !!(await Follow.findOne({ followerId: req.session.userId, followingId: profileUser.id })) : false;
    const followersWithData = await Promise.all(followers.map(async (f) => {
      const user = await User.findOne({ id: f.followerId });
      if (!user) return null;
      const isFollowed = req.session.userId ? !!(await Follow.findOne({ followerId: req.session.userId, followingId: user.id })) : false;
      return { id: user.id, username: user.username, avatar: user.avatar, isFollowed };
    }));
    const followingWithData = await Promise.all(following.map(async (f) => {
      const user = await User.findOne({ id: f.followingId });
      if (!user) return null;
      const isFollowedByMe = req.session.userId ? !!(await Follow.findOne({ followerId: req.session.userId, followingId: user.id })) : false;
      return { id: user.id, username: user.username, avatar: user.avatar, isFollowedByMe };
    }));
    res.render('profile', {
      profileUser,
      posts: postsWithStats,
      followersCount: followers.length,
      followingCount: following.length,
      followers: followersWithData.filter(v => v),
      following: followingWithData.filter(v => v),
      isFollowing,
      isOwnProfile: req.session.userId === profileUser.id,
      currentUser: req.session.userId ? { id: req.session.userId } : null
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('❌ Terjadi error');
  }
});

// ==================== NOTIFIKASI ====================

router.get('/notifications', isAuthenticated, async (req, res) => {
  const notifications = await Notification.find({ userId: req.session.userId }).sort({ timestamp: -1 }).lean();
  const notificationsWithData = await Promise.all(notifications.map(async (notif) => {
    const fromUser = await User.findOne({ id: notif.fromUserId }).lean() || { username: '[deleted]' };
    let post = null;
    if (notif.postId) {
      post = await Post.findOne({ id: notif.postId }).lean();
    }
    return { ...notif, fromUser, post };
  }));
  await Notification.updateMany({ userId: req.session.userId, read: false }, { $set: { read: true } });
  res.render('notifications', { notifications: notificationsWithData });
});

router.post('/notifications/clear', isAuthenticated, async (req, res) => {
  await Notification.deleteMany({ userId: req.session.userId });
  res.redirect('/notifications');
});

// ==================== PENCARIAN ====================

router.get('/search', async (req, res) => {
  const { q } = req.query;
  let results = { users: [], posts: [] };
  if (q && q.trim()) {
    const query = q.toLowerCase().trim();
    let users = await User.find({ username: { $regex: query, $options: 'i' } }).lean();
    if (req.session.userId) {
      users = await Promise.all(users.map(async (u) => {
        const isFollowing = !!(await Follow.findOne({ followerId: req.session.userId, followingId: u.id }));
        return { ...u, isFollowing };
      }));
    } else {
      users = users.map(u => ({ ...u, isFollowing: false }));
    }
    results.users = users;
    const posts = await Post.find({ caption: { $regex: query, $options: 'i' } }).sort({ timestamp: -1 }).lean();
    results.posts = await Promise.all(posts.map(async (post) => {
      const user = await User.findOne({ id: post.userId }).lean() || { username: '[deleted]' };
      const likes = await Like.countDocuments({ postId: post.id });
      const comments = await Comment.countDocuments({ postId: post.id });
      return { ...post, user, likesCount: likes, commentsCount: comments };
    }));
  }
  res.render('search', { query: q, results, currentUser: res.locals.currentUser || null });
});

// ==================== AVATAR ====================

router.post('/profile/avatar', isAuthenticated, uploadAvatar.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.redirect('/profile/edit?error=no_file');
    const avatarUrl = await uploadToBlob(req.file, 'avatars');
    const user = await User.findOne({ id: req.session.userId });
    if (user.avatar) {
      await deleteFromBlob(user.avatar);
    }
    user.avatar = avatarUrl;
    await user.save();
    res.redirect('/profile/' + req.session.userId);
  } catch (error) {
    console.error(error);
    res.redirect('/profile/edit?error=upload_failed');
  }
});

router.post('/profile/avatar/delete', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.session.userId });
    if (user && user.avatar) {
      await deleteFromBlob(user.avatar);
      user.avatar = null;
      await user.save();
    }
    res.redirect('/profile/' + req.session.userId);
  } catch (error) {
    console.error(error);
    res.redirect('/profile/edit?error=delete_failed');
  }
});

module.exports = router;