# Clizora — Full-stack prototype

Clizora is a creator-to-clipper campaign marketplace. Creators publish a video campaign, define clipping requirements, reserve a budget and set a rate per 1,000 eligible views. Clippers discover campaigns, publish short clips on their social channels and submit the clip URL. Creators review submissions. Approved submissions can earn view-milestone payouts, limited by the campaign's remaining budget.

This repository converts the original single-file HTML prototype into a separated frontend + backend project.

## Project structure

```text
Clizora_FullStack/
├── public/
│   ├── index.html           # Frontend page shell
│   ├── styles.css           # Responsive UI styles
│   └── app.js               # Frontend rendering, forms and API calls
├── src/
│   ├── db.js                # SQLite schema and demo seed data
│   ├── middleware/
│   │   └── auth.js           # JWT cookie authentication and role checks
│   ├── routes/
│   │   ├── auth.js           # Registration, email OTP, login and logout
│   │   ├── dashboard.js      # Role-specific dashboard data
│   │   ├── campaigns.js      # Campaign creation and lifecycle
│   │   ├── submissions.js    # Clip submission and creator review
│   │   ├── wallet.js         # Demo deposits and payout requests
│   │   └── admin.js          # Admin overview, users, payouts and test views
│   └── services/
│       ├── email.js          # SMTP email sender / development OTP logging
│       ├── payoutEngine.js   # Per-1,000-view earning calculation
│       └── videoPlatforms.js # Official social analytics integration boundary
├── docs/
│   ├── API.md                # API endpoint reference
│   └── DEVELOPMENT.md        # Development and production checklist
├── .env.example
├── .gitignore
├── package.json
└── server.js                 # Express application entry point
```

## Requirements

- Node.js 20 or later
- npm

## Run locally

1. Open this folder in VS Code or a terminal.
2. Install the dependencies:

   ```bash
   npm install
   ```

3. Create your environment file:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell, use:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Open `.env` and replace `JWT_SECRET` with a long random value (at least 32 characters).
5. Start the development server:

   ```bash
   npm run dev
   ```

   Or run `npm start` without auto-restart.
6. Open **http://localhost:3000** in your browser.

The SQLite database is created automatically at `data/clizora.sqlite` the first time the server starts. Do not commit the database or `.env` file.

## Demo login accounts

| Role | Email | Password |
|---|---|---|
| Creator | `demo.creator@gmail.com` | `demo1234` |
| Clipper | `demo.clipper@gmail.com` | `demo1234` |
| Admin | `admin@clizora.app` | `admin123` |

These accounts are seeded in development only. The server does not create these public demo credentials in production. For a first production admin, privately set `BOOTSTRAP_ADMIN_EMAIL` and a strong `BOOTSTRAP_ADMIN_PASSWORD` (at least 16 characters) before the first startup, then remove the password variable.

## What works in this prototype

- Creator, clipper and admin roles.
- Registration with a 6-digit email-verification step.
- Password hashing and login sessions stored in an HTTP-only cookie.
- Creator campaign creation, budget reservation, pause/resume and end/refund.
- Clipper campaign discovery and clip URL submission.
- Creator approval/rejection and optional feedback.
- Wallet ledger, simulated creator deposits and clipper payout requests.
- Admin user suspension, payout review and development-only test view updates.
- SQLite persistence across restarts.
- Per-1,000-eligible-view payout calculation, capped by the campaign escrow balance.

## Important integration limitations

This is a functional local prototype, **not a production payment or social-media analytics platform**.

- **Payments:** `POST /api/wallet/demo-deposit` simulates adding funds in development. It does not charge a card, UPI account or bank account. Payout requests are recorded for admin review; no money is transferred.
- **Social views:** The random view generator from the original front-end prototype has been removed. Development admins can adjust test view counts from the Admin → Submissions page. Real view counts require approved official API access, OAuth consent, token storage/refresh and platform-specific adapters. The `src/services/videoPlatforms.js` file marks the integration boundary; it deliberately does not invent live data.
- **Email OTP:** If SMTP is not configured in development, the OTP is printed in the server terminal and shown in the development UI. Production mode requires SMTP configuration.
- **Currency:** The prototype keeps the `$` currency display from the supplied HTML. Change the frontend formatting and business rules together before using a different currency.

## Earning rule

An approved submission can earn one campaign-rate payment for every complete 1,000 views accumulated **after approval**. Example: at `$2.50 / 1,000 views`, an approved clip earns `$2.50` at 1,000 eligible views and `$5.00` at 2,000 eligible views. Earnings are capped at the campaign's remaining budget. Pending and rejected submissions do not earn. Payout calculations run when the development admin updates a submission's test view count; a future analytics integration should call the same payout engine when a verified view count is refreshed.

## Useful commands

```bash
npm run check   # JavaScript syntax checks
npm run dev     # Run with nodemon
npm start       # Run the server
```

## Before public deployment

Read `docs/DEVELOPMENT.md`. In brief: configure HTTPS and a strong secret, SMTP, a real payment provider, official social analytics adapters, production database backups, monitoring, privacy/terms pages, age and payout eligibility checks, rate limits and security review. Do not use the demo deposit or test-view endpoints in production.
