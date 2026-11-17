# Development and production notes

## Main application flow

1. A creator signs up, verifies an email address and signs in.
2. The creator adds demo funds to the wallet. A live product must replace this with a real payment checkout and verified payment webhook.
3. The creator launches a campaign. The budget is reserved from the creator wallet in the same database transaction that creates the campaign.
4. A clipper browses active campaigns, publishes a short clip on a social platform, and submits the public clip URL.
5. The creator approves or rejects the submission. When approved, the current view count becomes the starting baseline. Earlier views are not paid by this implementation.
6. A verified count increase can generate a payout at each full 1,000 eligible-view milestone. The payout engine caps all earnings at the campaign's unspent escrow balance.
7. The clipper requests a payout. An admin marks it paid after an external/manual transfer, or rejects the request and returns the amount to the clipper wallet.

## Database

SQLite is used for the local prototype. The schema is created automatically by `src/db.js`.

Money is stored as integer cents to avoid floating-point errors. API responses convert cents to decimal amounts. For a multi-instance production deployment, use a managed relational database and migrations rather than SQLite file storage.

## Social platform analytics

The app accepts YouTube, Instagram and TikTok URLs as inputs, but accepting a URL is not the same as having permission to read its analytics. Each platform has its own API, app review, account eligibility, OAuth scopes and content ownership rules. Implement and test one provider at a time in `src/services/videoPlatforms.js`.

Recommended provider adapter contract:

- Validate the submitted public URL and normalize its platform/content identifier.
- Confirm that the connected account and token are authorized to access the analytics.
- Request a view count from the official platform API.
- Store the last successful count and fetch timestamp for audit/debugging.
- Reject stale, missing or unauthorized data; do not substitute a random or guessed number.
- Call `applyEarnings(submissionId)` after a verified count update.

The current app intentionally exposes only a development-only manual test-count endpoint to exercise the payout logic.

## Payments

A production payment flow needs a provider-specific checkout session, server-side signature/webhook verification, idempotency keys, payment status reconciliation and refund handling. Never trust a client-side success message as proof that money was received. Keep provider secrets on the backend, not in `public/app.js`.

The current demo deposit endpoint is disabled when `NODE_ENV=production`. Payout approval only changes the internal ledger state; an actual transfer must be performed and reconciled through a payment provider or a controlled payout process.

## Email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` and `SMTP_FROM`. Without SMTP, development OTPs are printed to the server console. Production registration will return an error when email is not configured.

## Production checklist

- Set `NODE_ENV=production`, `SEED_DEMO=false` and a long, random `JWT_SECRET`. Never deploy with demo seed accounts enabled. For the first admin, set `BOOTSTRAP_ADMIN_EMAIL` and a private password of at least 16 characters before the first boot, then remove the password variable.
- Terminate TLS/HTTPS at a trusted hosting platform or reverse proxy.
- Configure SMTP and test delivery, bounce handling and OTP rate limits.
- Integrate a real payment provider and signed webhooks; remove demo account credentials.
- Implement the official APIs/OAuth flows for social platforms you intend to support.
- Replace local SQLite with managed database storage, backups and schema migrations.
- Add audit logs, request monitoring, alerting, database restore testing and operational support.
- Review privacy, content rights, creator/clipper agreements, moderation, age eligibility, tax and payout rules with qualified professionals for the markets where the service will operate.
- Add automated integration tests and security testing before handling real accounts or funds.
