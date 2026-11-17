const express = require('express');
const { db, id, toCents, fromCents } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const validVideoUrl = (value) => {
  try {
    const u = new URL(value);
    return ['https:', 'http:'].includes(u.protocol) && /(^|\.)(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)$/i.test(u.hostname);
  } catch { return false; }
};
const shape = (c) => ({
  id: c.id, creatorId: c.creator_id, creatorName: c.creator_name,
  title: c.title, sourceUrl: c.source_url, brief: c.brief,
  rate: fromCents(c.rate_cents), budget: fromCents(c.budget_cents),
  spent: fromCents(c.spent_cents), remaining: fromCents(c.budget_cents - c.spent_cents),
  status: c.status, createdAt: c.created_at
});
const selectCampaigns = `SELECT c.*, u.name AS creator_name FROM campaigns c JOIN users u ON u.id=c.creator_id`;

router.use(requireAuth);
router.get('/', (req, res) => {
  let rows;
  if (req.user.role === 'creator') rows = db.prepare(`${selectCampaigns} WHERE c.creator_id=? ORDER BY c.created_at DESC`).all(req.user.id);
  else if (req.user.role === 'clipper') rows = db.prepare(`${selectCampaigns} WHERE c.status='active' ORDER BY c.created_at DESC`).all();
  else rows = db.prepare(`${selectCampaigns} ORDER BY c.created_at DESC`).all();
  res.json({ campaigns: rows.map(shape) });
});

router.post('/', requireRole('creator'), (req, res) => {
  const title = String(req.body?.title || '').trim();
  const sourceUrl = String(req.body?.sourceUrl || '').trim();
  const brief = String(req.body?.brief || '').trim();
  const rateCents = toCents(req.body?.rate);
  const budgetCents = toCents(req.body?.budget);
  if (title.length < 3 || title.length > 120) return res.status(400).json({ error: 'Campaign title must be 3–120 characters.' });
  if (!validVideoUrl(sourceUrl)) return res.status(400).json({ error: 'Use a valid YouTube, Instagram, or TikTok source video URL.' });
  if (brief.length < 10 || brief.length > 2000) return res.status(400).json({ error: 'Campaign requirements must be 10–2,000 characters.' });
  if (!Number.isSafeInteger(rateCents) || rateCents < 1 || !Number.isSafeInteger(budgetCents) || budgetCents < rateCents) return res.status(400).json({ error: 'Set a positive rate and a budget at least as large as one rate payment.' });

  const run = db.transaction(() => {
    const current = db.prepare('SELECT wallet_cents FROM users WHERE id=?').get(req.user.id);
    if (current.wallet_cents < budgetCents) throw new Error('NOT_ENOUGH_FUNDS');
    const campaignId = id();
    db.prepare('UPDATE users SET wallet_cents=wallet_cents-? WHERE id=?').run(budgetCents, req.user.id);
    db.prepare(`INSERT INTO campaigns (id,creator_id,title,source_url,brief,rate_cents,budget_cents,spent_cents,status,created_at)
      VALUES (?,?,?,?,?,?,?,0,'active',?)`).run(campaignId, req.user.id, title, sourceUrl, brief, rateCents, budgetCents, Date.now());
    db.prepare(`INSERT INTO transactions (id,user_id,type,amount_cents,note,status,created_at)
      VALUES (?,?, 'escrow', ?, ?, 'done', ?)`)
      .run(id(), req.user.id, -budgetCents, `Budget locked · ${title}`, Date.now());
    return campaignId;
  });
  try {
    const campaignId = run();
    const campaign = db.prepare(`${selectCampaigns} WHERE c.id=?`).get(campaignId);
    res.status(201).json({ campaign: shape(campaign) });
  } catch (error) {
    if (error.message === 'NOT_ENOUGH_FUNDS') return res.status(400).json({ error: 'Not enough wallet balance. Add funds before launching this campaign.' });
    throw error;
  }
});

router.patch('/:id/status', requireRole('creator','admin'), (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
  if (req.user.role !== 'admin' && campaign.creator_id !== req.user.id) return res.status(403).json({ error: 'You do not own this campaign.' });
  const action = String(req.body?.status || '');
  if (!['active','paused','ended'].includes(action)) return res.status(400).json({ error: 'Choose active, paused, or ended.' });
  if (campaign.status === 'ended' && action !== 'ended') return res.status(400).json({ error: 'An ended campaign cannot be restarted.' });

  const run = db.transaction(() => {
    const current = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
    if (action === 'ended' && current.status !== 'ended') {
      const refund = Math.max(0, current.budget_cents - current.spent_cents);
      if (refund > 0) {
        db.prepare('UPDATE users SET wallet_cents=wallet_cents+? WHERE id=?').run(refund, current.creator_id);
        db.prepare(`INSERT INTO transactions (id,user_id,type,amount_cents,note,status,created_at)
          VALUES (?,?, 'refund', ?, ?, 'done', ?)`)
          .run(id(), current.creator_id, refund, `Unspent budget · ${current.title}`, Date.now());
      }
      db.prepare("UPDATE campaigns SET status='ended' WHERE id=?").run(current.id);
    } else {
      db.prepare('UPDATE campaigns SET status=? WHERE id=?').run(action, current.id);
    }
  });
  run();
  res.json({ message: action === 'ended' ? 'Campaign ended and unused budget returned.' : `Campaign ${action}.` });
});

module.exports = router;
