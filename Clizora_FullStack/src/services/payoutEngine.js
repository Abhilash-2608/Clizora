const { db, fromCents } = require('../db');

/*
 * Pays only approved submissions. One campaign rate is earned for every full
 * 1,000 views received after the clip was approved. Payments are capped by
 * the campaign's remaining escrow budget.
 */
function applyEarnings(submissionId) {
  const run = db.transaction(() => {
    const row = db.prepare(`
      SELECT s.*, c.title AS campaign_title, c.rate_cents, c.budget_cents,
             c.spent_cents, c.status AS campaign_status,
             u.wallet_cents, u.banned
      FROM submissions s
      JOIN campaigns c ON c.id = s.campaign_id
      JOIN users u ON u.id = s.clipper_id
      WHERE s.id = ?
    `).get(submissionId);

    if (!row || row.status !== 'approved' || row.campaign_status !== 'active' || row.banned) {
      return { paid: 0, reason: 'not-eligible' };
    }

    const eligibleViews = Math.max(0, row.views - row.eligible_views_base);
    const earnedByViews = Math.floor(eligibleViews / 1000) * row.rate_cents;
    const outstanding = Math.max(0, earnedByViews - row.paid_cents);
    const budgetRemaining = Math.max(0, row.budget_cents - row.spent_cents);
    const amount = Math.min(outstanding, budgetRemaining);

    if (amount <= 0) return { paid: 0, reason: 'no-new-milestone' };

    db.prepare('UPDATE users SET wallet_cents = wallet_cents + ? WHERE id = ?').run(amount, row.clipper_id);
    db.prepare('UPDATE campaigns SET spent_cents = spent_cents + ? WHERE id = ?').run(amount, row.campaign_id);
    db.prepare('UPDATE submissions SET paid_cents = paid_cents + ? WHERE id = ?').run(amount, submissionId);
    db.prepare(`INSERT INTO transactions (id,user_id,type,amount_cents,note,status,created_at)
      VALUES (lower(hex(randomblob(16))),?,'earning',?,?, 'done',?)`)
      .run(row.clipper_id, amount, `${row.campaign_title} · view milestone payout`, Date.now());

    const updated = db.prepare('SELECT budget_cents, spent_cents FROM campaigns WHERE id = ?').get(row.campaign_id);
    if (updated.budget_cents - updated.spent_cents <= 0) {
      db.prepare("UPDATE campaigns SET status = 'ended' WHERE id = ?").run(row.campaign_id);
    }
    return { paid: fromCents(amount), reason: 'paid' };
  });
  return run();
}

module.exports = { applyEarnings };
