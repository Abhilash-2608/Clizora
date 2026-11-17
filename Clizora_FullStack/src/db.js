const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const configuredPath = process.env.DB_FILE || './data/clizora.sqlite';
const dbPath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(process.cwd(), configuredPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('creator','clipper','admin')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  age INTEGER NOT NULL,
  handle TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  wallet_cents INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  payload_json TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email, created_at DESC);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  brief TEXT NOT NULL,
  rate_cents INTEGER NOT NULL CHECK(rate_cents > 0),
  budget_cents INTEGER NOT NULL CHECK(budget_cents > 0),
  spent_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','ended')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaign_creator ON campaigns(creator_id, created_at DESC);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  clipper_id TEXT NOT NULL REFERENCES users(id),
  clip_url TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  views INTEGER NOT NULL DEFAULT 0,
  eligible_views_base INTEGER NOT NULL DEFAULT 0,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  feedback TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_submission_campaign ON submissions(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submission_clipper ON submissions(clipper_id, created_at DESC);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done' CHECK(status IN ('done','request','paid','rejected')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);
`);

function seedDemoData() {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount > 0) return;

  // Never create public demo credentials in production. A first production
  // admin can be provisioned once from the private BOOTSTRAP_ADMIN_* env vars.
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO !== 'true') {
    const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
    const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
    if (email && password.length >= 16) {
      db.prepare(`INSERT INTO users (id,role,name,email,age,handle,password_hash,wallet_cents,verified,created_at)
        VALUES (?,?,?,?,18,'',?,0,1,?)`).run(
        'admin-' + require('node:crypto').randomUUID(), 'admin', 'Clizora Admin', email,
        bcrypt.hashSync(password, 12), Date.now()
      );
      console.log('A production admin account was bootstrapped from environment variables. Remove BOOTSTRAP_ADMIN_PASSWORD after first startup.');
    }
    return;
  }

  const now = Date.now();
  const adminId = 'a1';
  const creatorId = 'c1';
  const clipperId = 'k1';
  const adminHash = bcrypt.hashSync('admin123', 10);
  const demoHash = bcrypt.hashSync('demo1234', 10);

  const seed = db.transaction(() => {
    const addUser = db.prepare(`INSERT INTO users
      (id, role, name, email, age, handle, password_hash, wallet_cents, verified, created_at)
      VALUES (@id,@role,@name,@email,@age,@handle,@password_hash,@wallet_cents,1,@created_at)`);
    addUser.run({ id: adminId, role: 'admin', name: 'Clizora Admin', email: 'admin@clizora.app', age: 30, handle: '', password_hash: adminHash, wallet_cents: 0, created_at: now });
    addUser.run({ id: creatorId, role: 'creator', name: 'Maya Rivers', email: 'demo.creator@gmail.com', age: 29, handle: 'https://youtube.com/@mayarivers', password_hash: demoHash, wallet_cents: 20000, created_at: now });
    addUser.run({ id: clipperId, role: 'clipper', name: 'Arjun Clips', email: 'demo.clipper@gmail.com', age: 22, handle: 'https://instagram.com/arjunclips', password_hash: demoHash, wallet_cents: 1250, created_at: now });

    db.prepare(`INSERT INTO campaigns
      (id, creator_id, title, source_url, brief, rate_cents, budget_cents, spent_cents, status, created_at)
      VALUES ('m1', ?, ?, ?, ?, 250, 30000, 1250, 'active', ?)`)
      .run(creatorId, 'Podcast ep. 42 highlights', 'https://www.youtube.com/watch?v=demo-source', '15–45s vertical clips, captions on, hook in the first 2 seconds, tag @mayarivers.', now);

    db.prepare(`INSERT INTO submissions
      (id,campaign_id,clipper_id,clip_url,status,views,eligible_views_base,paid_cents,feedback,created_at,reviewed_at)
      VALUES ('s1','m1',?,'https://www.youtube.com/shorts/demo1','approved',5000,0,1250,'',?,?)`)
      .run(clipperId, now, now);
    db.prepare(`INSERT INTO submissions
      (id,campaign_id,clipper_id,clip_url,status,views,eligible_views_base,paid_cents,created_at)
      VALUES ('s2','m1',?,'https://www.instagram.com/reel/demo2','pending',0,0,0,?)`)
      .run(clipperId, now);

    db.prepare(`INSERT INTO transactions (id,user_id,type,amount_cents,note,status,created_at)
      VALUES ('x1',?,'earning',1250,'Podcast ep. 42 highlights · 5,000 views','done',?)`)
      .run(clipperId, now);
    db.prepare(`INSERT INTO transactions (id,user_id,type,amount_cents,note,status,created_at)
      VALUES ('x2',?,'escrow',-30000,'Budget locked · Podcast ep. 42 highlights','done',?)`)
      .run(creatorId, now);
  });
  seed();
}

seedDemoData();

const id = () => require('node:crypto').randomUUID();
const toCents = (amount) => Math.round(Number(amount) * 100);
const fromCents = (cents) => Number((Number(cents || 0) / 100).toFixed(2));

module.exports = { db, id, toCents, fromCents };
