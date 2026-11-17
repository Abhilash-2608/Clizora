const express = require('express');
const { db, fromCents } = require('../db');
const { requireAuth, publicUser } = require('../middleware/auth');
const router = express.Router();

function campaignsFor(user) {
  const where = user.role === 'creator' ? 'WHERE c.creator_id=?' : (user.role === 'clipper' ? "WHERE c.status='active'" : '');
  const rows = db.prepare(`SELECT c.*,u.name AS creator_name FROM campaigns c JOIN users u ON u.id=c.creator_id ${where} ORDER BY c.created_at DESC`)
    .all(...(user.role === 'creator' ? [user.id] : []));
  return rows.map(c=>({id:c.id,creatorId:c.creator_id,creatorName:c.creator_name,title:c.title,sourceUrl:c.source_url,brief:c.brief,rate:fromCents(c.rate_cents),budget:fromCents(c.budget_cents),spent:fromCents(c.spent_cents),remaining:fromCents(c.budget_cents-c.spent_cents),status:c.status,createdAt:c.created_at}));
}
function submissionsFor(user) {
  let filter = '', args = [];
  if (user.role === 'creator') { filter='WHERE c.creator_id=?'; args=[user.id]; }
  if (user.role === 'clipper') { filter='WHERE s.clipper_id=?'; args=[user.id]; }
  const rows = db.prepare(`SELECT s.*,c.title AS campaign_title,c.creator_id,c.status AS campaign_status,cu.name AS creator_name,u.name AS clipper_name,u.handle AS clipper_handle,u.age AS clipper_age FROM submissions s JOIN campaigns c ON c.id=s.campaign_id JOIN users u ON u.id=s.clipper_id JOIN users cu ON cu.id=c.creator_id ${filter} ORDER BY s.created_at DESC`).all(...args);
  return rows.map(s=>({id:s.id,campaignId:s.campaign_id,campaignTitle:s.campaign_title,creatorId:s.creator_id,creatorName:s.creator_name,clipperId:s.clipper_id,clipperName:s.clipper_name,clipperHandle:s.clipper_handle,clipperAge:s.clipper_age,clipUrl:s.clip_url,status:s.status,views:s.views,paid:fromCents(s.paid_cents),feedback:s.feedback,campaignStatus:s.campaign_status,createdAt:s.created_at}));
}
router.get('/', requireAuth, (req,res)=>{
  const user = req.user;
  const transactions = db.prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 12').all(user.id)
    .map(t=>({id:t.id,type:t.type,amount:fromCents(t.amount_cents),note:t.note,status:t.status,createdAt:t.created_at}));
  const campaigns = campaignsFor(user);
  const submissions = submissionsFor(user);
  const response = { user: publicUser(user), campaigns, submissions, transactions, demoMode: process.env.NODE_ENV !== 'production' };
  if (user.role === 'creator') {
    response.stats = {
      wallet: fromCents(user.wallet_cents),
      views: submissions.reduce((sum,s)=>sum+s.views,0),
      liveCampaigns: campaigns.filter(c=>c.status==='active').length,
      awaitingReview: submissions.filter(s=>s.status==='pending').length,
      paid: campaigns.reduce((sum,c)=>sum+c.spent,0)
    };
  } else if (user.role === 'clipper') {
    response.stats = {
      wallet: fromCents(user.wallet_cents),
      earned: submissions.reduce((sum,s)=>sum+s.paid,0),
      views: submissions.reduce((sum,s)=>sum+s.views,0),
      joined: new Set(submissions.map(s=>s.campaignId)).size
    };
  } else {
    response.stats = {
      users: db.prepare('SELECT COUNT(*) AS n FROM users WHERE role != \'admin\'').get().n,
      creators: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='creator'").get().n,
      clippers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='clipper'").get().n,
      activeCampaigns: db.prepare("SELECT COUNT(*) AS n FROM campaigns WHERE status='active'").get().n,
      views: db.prepare('SELECT COALESCE(SUM(views),0) AS n FROM submissions').get().n,
      paid: db.prepare('SELECT COALESCE(SUM(spent_cents),0) AS n FROM campaigns').get().n / 100,
      pendingPayouts: db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE status='request'").get().n
    };
  }
  res.json(response);
});
module.exports = router;
