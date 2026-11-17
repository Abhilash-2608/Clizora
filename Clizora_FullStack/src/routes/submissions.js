const express = require('express');
const { db, id, fromCents } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const validVideoUrl = (value) => {
  try {
    const u = new URL(value);
    return ['https:', 'http:'].includes(u.protocol) && /(^|\.)(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)$/i.test(u.hostname);
  } catch { return false; }
};
const selectSubmissions = `SELECT s.*, c.title AS campaign_title, c.creator_id, c.status AS campaign_status,
  c.rate_cents, c.budget_cents, c.spent_cents, cu.name AS creator_name,
  u.name AS clipper_name, u.handle AS clipper_handle, u.age AS clipper_age
  FROM submissions s JOIN campaigns c ON c.id=s.campaign_id
  JOIN users u ON u.id=s.clipper_id JOIN users cu ON cu.id=c.creator_id`;
const shape = (s) => ({
  id: s.id, campaignId: s.campaign_id, campaignTitle: s.campaign_title,
  creatorId: s.creator_id, creatorName: s.creator_name,
  clipperId: s.clipper_id, clipperName: s.clipper_name,
  clipperHandle: s.clipper_handle, clipperAge: s.clipper_age,
  clipUrl: s.clip_url, status: s.status, views: s.views,
  paid: fromCents(s.paid_cents), feedback: s.feedback,
  campaignStatus: s.campaign_status, createdAt: s.created_at, reviewedAt: s.reviewed_at
});

router.use(requireAuth);
router.get('/', (req, res) => {
  let rows;
  if (req.user.role === 'clipper') rows = db.prepare(`${selectSubmissions} WHERE s.clipper_id=? ORDER BY s.created_at DESC`).all(req.user.id);
  else if (req.user.role === 'creator') rows = db.prepare(`${selectSubmissions} WHERE c.creator_id=? ORDER BY s.created_at DESC`).all(req.user.id);
  else rows = db.prepare(`${selectSubmissions} ORDER BY s.created_at DESC`).all();
  res.json({ submissions: rows.map(shape) });
});

router.post('/', requireRole('clipper'), (req, res) => {
  const campaignId = String(req.body?.campaignId || '');
  const clipUrl = String(req.body?.clipUrl || '').trim();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id=?').get(campaignId);
  if (!campaign || campaign.status !== 'active') return res.status(400).json({ error: 'This campaign is not accepting submissions.' });
  if (!validVideoUrl(clipUrl)) return res.status(400).json({ error: 'Submit a valid YouTube, Instagram, or TikTok clip URL.' });
  if (db.prepare('SELECT id FROM submissions WHERE clip_url=?').get(clipUrl)) return res.status(409).json({ error: 'That clip URL has already been submitted.' });
  const submissionId = id();
  db.prepare(`INSERT INTO submissions (id,campaign_id,clipper_id,clip_url,status,views,eligible_views_base,paid_cents,created_at)
    VALUES (?,?,?,?,'pending',0,0,0,?)`).run(submissionId, campaignId, req.user.id, clipUrl, Date.now());
  res.status(201).json({ message: 'Clip submitted for creator review.', id: submissionId });
});

router.patch('/:id/review', requireRole('creator'), (req, res) => {
  const submission = db.prepare(`SELECT s.*,c.creator_id FROM submissions s JOIN campaigns c ON c.id=s.campaign_id WHERE s.id=?`).get(req.params.id);
  if (!submission) return res.status(404).json({ error: 'Submission not found.' });
  if (submission.creator_id !== req.user.id) return res.status(403).json({ error: 'You can only review submissions on your campaigns.' });
  if (submission.status !== 'pending') return res.status(400).json({ error: 'This submission has already been reviewed.' });
  const status = String(req.body?.status || '');
  if (!['approved','rejected'].includes(status)) return res.status(400).json({ error: 'Choose approved or rejected.' });
  const feedback = String(req.body?.feedback || '').trim().slice(0, 500);
  db.prepare(`UPDATE submissions SET status=?, feedback=?, eligible_views_base=views, reviewed_at=? WHERE id=?`)
    .run(status, feedback, Date.now(), submission.id);
  res.json({ message: status === 'approved' ? 'Clip approved. Eligible view milestones can now earn.' : 'Clip rejected.' });
});

module.exports = router;
