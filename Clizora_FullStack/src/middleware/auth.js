const jwt = require('jsonwebtoken');
const { db } = require('../db');

const COOKIE_NAME = 'clizora_token';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000
});

function signIn(res, user) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be set to a random string of at least 32 characters.');
  const token = jwt.sign({ sub: user.id }, secret, { expiresIn: '7d' });
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Please log in to continue.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'Account not found. Please log in again.' });
    if (user.banned) return res.status(403).json({ error: 'This account is suspended.' });
    req.user = user;
    next();
  } catch (_error) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    age: user.age,
    handle: user.handle,
    wallet: require('../db').fromCents(user.wallet_cents),
    banned: Boolean(user.banned),
    createdAt: user.created_at
  };
}

module.exports = { COOKIE_NAME, cookieOptions, signIn, requireAuth, requireRole, publicUser };
