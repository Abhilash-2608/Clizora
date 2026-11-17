const express = require('express');
const { db, id, toCents, fromCents } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const user = db.prepare('SELECT wallet_cents FROM users WHERE id=?').get(req.user.id);
  const transactions = db.prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(req.user.id)
    .map(t => ({ id: t.id, type: t.type, amount: fromCents(t.amount_cents), note: t.note, status: t.status, createdAt: t.created_at }));
  res.json({ balance: fromCents(user.wallet_cents), transactions });
});

router.post('/demo-deposit', requireRole('creator'), (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_PAYMENTS !== 'true') {
    return res.status(403).json({ error: 'Demo deposits are disabled. Connect a verified payment provider for real checkout.' });
  }
  const amount = toCents(req.body?.amount);
  const method = String(req.body?.method || 'Demo checkout').slice(0, 40);
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 1000000) return res.status(400).json({ error: 'Enter an amount between $1 and $10,000.' });
  const run = db.transaction(() => {
    db.prepare('UPDATE users SET wallet_cents=wallet_cents+? WHERE id=?').run(amount, req.user.id);
    db.prepare(`INSERT INTO transactions (id,user_id,type,amount_cents,note,status,created_at)
      VALUES (?,?, 'deposit', ?, ?, 'done', ?)`)
      .run(id(), req.user.id, amount, `DEMO ONLY · ${method} · simulated`, Date.now());
  });
  run();
  res.json({ message: 'Demo funds added. No real payment was processed.' });
});

router.post('/payout-request', requireRole('clipper'), (req, res) => {
  const amount = toCents(req.body?.amount);
  const method = String(req.body?.method || '').trim().slice(0, 40);
  const destination = String(req.body?.destination || '').trim().slice(0, 120);
  if (!Number.isSafeInteger(amount) || amount < 100) return res.status(400).json({ error: 'Minimum payout request is $1.00.' });
  if (!method || destination.length < 3) return res.status(400).json({ error: 'Enter a payout method and destination.' });

  const run = db.transaction(() => {
    const user = db.prepare('SELECT wallet_cents FROM users WHERE id=?').get(req.user.id);
    if (user.wallet_cents < amount) throw new Error('INSUFFICIENT_BALANCE');
    db.prepare('UPDATE users SET wallet_cents=wallet_cents-? WHERE id=?').run(amount, req.user.id);
    db.prepare(`INSERT INTO transactions (id,user_id,type,amount_cents,note,status,created_at)
      VALUES (?,?, 'withdrawal', ?, ?, 'request', ?)`)
      .run(id(), req.user.id, -amount, `${method} → ${destination}`, Date.now());
  });
  try { run(); } catch (error) {
    if (error.message === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: 'The requested amount is greater than your available balance.' });
    throw error;
  }
  res.json({ message: 'Payout request submitted for admin review.' });
});

module.exports = router;
