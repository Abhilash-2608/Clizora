const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { db, id } = require('../db');
const { signIn, COOKIE_NAME, cookieOptions, publicUser } = require('../middleware/auth');
const { sendOtpEmail } = require('../services/email');

const router = express.Router();
const hashCode = (code) => crypto.createHash('sha256').update(`${process.env.JWT_SECRET}:${code}`).digest('hex');
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validProfile = (value) => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && /(^|\.)(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)$/i.test(url.hostname);
  } catch { return false; }
};

router.post('/register', async (req, res, next) => {
  try {
    const { role, name, email, age, handle, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();
    const numericAge = Number(age);
    if (!['creator', 'clipper'].includes(role)) return res.status(400).json({ error: 'Choose creator or clipper as your account type.' });
    if (cleanName.length < 2 || cleanName.length > 80) return res.status(400).json({ error: 'Enter a name between 2 and 80 characters.' });
    if (!validEmail(normalizedEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!Number.isInteger(numericAge) || numericAge < 13 || numericAge > 100) return res.status(400).json({ error: 'Enter a valid age.' });
    if (!validProfile(String(handle || '').trim())) return res.status(400).json({ error: 'Enter a YouTube, Instagram, or TikTok profile URL.' });
    if (String(password || '').length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)) return res.status(409).json({ error: 'That email is already registered.' });

    const code = String(crypto.randomInt(100000, 1000000));
    const now = Date.now();
    const payload = { role, name: cleanName, email: normalizedEmail, age: numericAge, handle: String(handle).trim(), passwordHash: await bcrypt.hash(password, 12) };
    db.prepare('DELETE FROM otp_codes WHERE email = ?').run(normalizedEmail);
    db.prepare(`INSERT INTO otp_codes (id,email,payload_json,code_hash,expires_at,attempts,created_at)
      VALUES (?,?,?,?,?,0,?)`).run(id(), normalizedEmail, JSON.stringify(payload), hashCode(code), now + 5 * 60 * 1000, now);

    const delivery = await sendOtpEmail(normalizedEmail, code);
    res.json({ message: 'Verification code sent. It expires in 5 minutes.', developmentCode: delivery.development ? code : undefined });
  } catch (error) { next(error); }
});

router.post('/verify-otp', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  const pending = db.prepare('SELECT * FROM otp_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1').get(email);
  if (!pending) return res.status(400).json({ error: 'No pending verification was found. Please sign up again.' });
  if (Date.now() > pending.expires_at) {
    db.prepare('DELETE FROM otp_codes WHERE id = ?').run(pending.id);
    return res.status(400).json({ error: 'That code has expired. Please sign up again.' });
  }
  if (pending.attempts >= 5) {
    db.prepare('DELETE FROM otp_codes WHERE id = ?').run(pending.id);
    return res.status(429).json({ error: 'Too many incorrect attempts. Please sign up again.' });
  }
  if (hashCode(code) !== pending.code_hash) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(pending.id);
    return res.status(400).json({ error: 'Incorrect verification code.' });
  }

  const p = JSON.parse(pending.payload_json);
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'That email is already registered.' });
  const userId = id();
  db.prepare(`INSERT INTO users (id,role,name,email,age,handle,password_hash,wallet_cents,verified,created_at)
    VALUES (?,?,?,?,?,?,?,0,1,?)`).run(userId, p.role, p.name, p.email, p.age, p.handle, p.passwordHash, Date.now());
  db.prepare('DELETE FROM otp_codes WHERE email = ?').run(email);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  signIn(res, user);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  if (!user.verified) return res.status(403).json({ error: 'Please verify your email before logging in.' });
  if (user.banned) return res.status(403).json({ error: 'This account is suspended.' });
  signIn(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ message: 'Logged out.' });
});

module.exports = router;
