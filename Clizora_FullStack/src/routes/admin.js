const express = require('express');
const { db, id, fromCents } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { applyEarnings } = require('../services/payoutEngine');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/overview', (_req, res) => {
  const users = db.prepare('SELECT id,role,name,email,age,handle,wallet_cents,banned,created_at FROM users WHERE role != \'admin\' ORDER BY created_at DESC').all()
    .map(u => ({ id: u.id, role: u.role, name: u.name, email: u.email, age: u.age, handle: u.handle, wallet: fromCents(u.wallet_cents), banned: Boolean(u.banned), createdAt: u.created_at }));
  const campaigns = db.prepare(`SELECT c.*,u.name AS creator_name FROM campaigns c JOIN users u ON u.id=c.creator_id ORDER BY c.created_at DESC`).all()
    .map(c => ({ id: c.id, creatorId: c.creator_id, creatorName: c.creator_name, title: c.title, sourceUrl: c.source_url, brief: c.brief, rate: fromCents(c.rate_cents), budget: fromCents(c.budget_cents), spent: fromCents(c.spent_cents), remaining: fromCents(c.budget_cents-c.spent_cents), status: c.status, createdAt: c.created_at }));
  const submissions = db.prepare(`SELECT s.*,c.title AS campaign_title,c.creator_id,c.status AS campaign_status,cu.name AS creator_name,u.name AS clipper_name,u.handle AS clipper_handle,u.age AS clipper_age FROM submissions s JOIN campaigns c ON c.id=s.campaign_id JOIN users u ON u.id=s.clipper_id JOIN users cu ON cu.id=c.creator_id ORDER BY s.created_at DESC`).all()
    .map(s => ({ id:s.id,campaignId:s.campaign_id,campaignTitle:s.campaign_title,creatorId:s.creator_id,creatorName:s.creator_name,clipperId:s.clipper_id,clipperName:s.clipper_name,clipperHandle:s.clipper_handle,clipperAge:s.clipper_age,clipUrl:s.clip_url,status:s.status,views:s.views,paid:fromCents(s.paid_cents),feedback:s.feedback,campaignStatus:s.campaign_status,createdAt:s.created_at }));
  const payouts = db.prepare("SELECT * FROM transactions WHERE status='request' ORDER BY created_at ASC").all()
    .map(t => ({ id:t.id,userId:t.user_id,userName:db.prepare('SELECT name FROM users WHERE id=?').get(t.user_id)?.name || 'Unknown',amount:fromCents(-t.amount_cents),note:t.note,createdAt:t.created_at }));
  const stats = {
    creators: users.filter(u => u.role==='creator').length,
    clippers: users.filter(u => u.role==='clipper').length,
    activeCampaigns: campaigns.filter(c => c.status==='active').length,
    views: submissions.reduce((sum,s)=>sum+s.views,0),
    paidToClippers: campaigns.reduce((sum,c)=>sum+c.spent,0),
    heldEscrow: campaigns.filter(c=>c.status!=='ended').reduce((sum,c)=>sum+c.remaining,0),
    pendingPayouts: payouts.length
  };
  res.json({ stats, users, campaigns, submissions, payouts });
});

router.patch('/users/:id/ban', (req, res) => {
  const user = db.prepare("SELECT id,role,banned FROM users WHERE id=? AND role!='admin'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const next = user.banned ? 0 : 1;
  db.prepare('UPDATE users SET banned=? WHERE id=?').run(next, user.id);
  res.json({ message: next ? 'Account suspended.' : 'Account reinstated.', banned: Boolean(next) });
});

router.patch('/payouts/:id', (req, res) => {
  const action = String(req.body?.action || '');
  if (!['paid','reject'].includes(action)) return res.status(400).json({ error: 'Choose paid or reject.' });
  const run = db.transaction(() => {
    const tx = db.prepare("SELECT * FROM transactions WHERE id=? AND status='request'").get(req.params.id);
    if (!tx) throw new Error('PAYOUT_NOT_FOUND');
    if (action === 'paid') {
      db.prepare("UPDATE transactions SET status='paid' WHERE id=?").run(tx.id);
    } else {
      db.prepare("UPDATE transactions SET status='rejected' WHERE id=?").run(tx.id);
      db.prepare('UPDATE users SET wallet_cents=wallet_cents+? WHERE id=?').run(Math.abs(tx.amount_cents), tx.user_id);
      db.prepare(`INSERT INTO transactions (id,user_id,type,amount_cents,note,status,created_at)
        VALUES (?,?, 'payout_refund', ?, ?, 'done', ?)`)
        .run(id(), tx.user_id, Math.abs(tx.amount_cents), 'Rejected payout request refunded', Date.now());
    }
  });
  try { run(); } catch (error) {
    if (error.message === 'PAYOUT_NOT_FOUND') return res.status(404).json({ error: 'Pending payout not found.' });
    throw error;
  }
  res.json({ message: action === 'paid' ? 'Payout marked as paid.' : 'Payout rejected and balance refunded.' });
});

router.post('/submissions/:id/test-views', (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Test view updates are disabled in production.' });
  const views = Number(req.body?.views);
  if (!Number.isSafeInteger(views) || views < 0 || views > 1000000000) return res.status(400).json({ error: 'Enter a valid non-negative view count.' });
  const submission = db.prepare('SELECT * FROM submissions WHERE id=?').get(req.params.id);
  if (!submission) return res.status(404).json({ error: 'Submission not found.' });
  if (views < submission.views) return res.status(400).json({ error: 'Test views cannot be lower than the current view count.' });
  db.prepare('UPDATE submissions SET views=? WHERE id=?').run(views, submission.id);
  const payout = applyEarnings(submission.id);
  res.json({ message: 'Demo view count updated.', payout });
});

module.exports = router;
