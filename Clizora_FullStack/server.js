require('dotenv').config();
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { db } = require('./src/db');
const { requireAuth, publicUser } = require('./src/middleware/auth');

const app = express();
const PORT = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('Set a strong JWT_SECRET (at least 32 characters) before starting in production.');
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));

app.get('/api/health', (_req,res)=>res.json({ status:'ok', app:'Clizora API', time:new Date().toISOString() }));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/campaigns', require('./src/routes/campaigns'));
app.use('/api/submissions', require('./src/routes/submissions'));
app.use('/api/wallet', require('./src/routes/wallet'));
app.use('/api/admin', require('./src/routes/admin'));
app.get('/api/auth/me', requireAuth, (req,res)=>res.json({ user:publicUser(req.user) }));

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('*', (_req,res)=>res.sendFile(path.join(publicDir,'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'An unexpected server error occurred.' : (error.message || 'Internal server error.') });
});

const server = app.listen(PORT, () => {
  console.log(`\nClizora is running at http://localhost:${PORT}`);
  console.log('Demo creator: demo.creator@gmail.com / demo1234');
  console.log('Demo clipper: demo.clipper@gmail.com / demo1234');
  console.log('Demo admin:   admin@clizora.app / admin123\n');
  console.log('Development OTP codes are printed in this terminal when SMTP is not configured.');
});

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
