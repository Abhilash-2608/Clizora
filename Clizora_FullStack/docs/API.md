# Clizora API reference

All API routes are served from the same origin under `/api`. JSON request and response bodies are used. Authenticated routes use an HTTP-only `clizora_token` cookie.

## Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create pending registration and send OTP |
| POST | `/api/auth/verify-otp` | Verify OTP, create account and sign in |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Clear session cookie |
| GET | `/api/auth/me` | Return current authenticated user |
| GET | `/api/dashboard` | Return role-specific dashboard data |

Example registration body:

```json
{
  "role": "creator",
  "name": "Sample Creator",
  "email": "creator@example.com",
  "age": 21,
  "handle": "https://youtube.com/@samplecreator",
  "password": "a-long-password"
}
```

## Campaigns

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| GET | `/api/campaigns` | All | List campaigns visible to current role |
| POST | `/api/campaigns` | Creator | Create campaign and reserve wallet budget |
| PATCH | `/api/campaigns/:id/status` | Owner / admin | Pause, resume or end campaign |

Campaign create body: `title`, `sourceUrl`, `brief`, `rate`, `budget`.

Status body: `{ "status": "paused" }`, `{ "status": "active" }` or `{ "status": "ended" }`. Ending refunds the unused budget to the creator.

## Submissions

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| GET | `/api/submissions` | All | List role-visible submissions |
| POST | `/api/submissions` | Clipper | Submit a published clip URL |
| PATCH | `/api/submissions/:id/review` | Campaign creator | Approve or reject a pending clip |

Clip submission body: `{ "campaignId": "...", "clipUrl": "https://..." }`.

Review body: `{ "status": "approved", "feedback": "Optional note" }`.

## Wallet

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| GET | `/api/wallet` | Creator / clipper | Current balance and transaction list |
| POST | `/api/wallet/demo-deposit` | Creator, development only | Add simulated funds |
| POST | `/api/wallet/payout-request` | Clipper | Request manual payout review |

Demo deposit body: `{ "amount": 100, "method": "UPI demo" }`.

Payout body: `{ "amount": 10, "method": "UPI", "destination": "example@upi" }`.

## Admin

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/admin/overview` | Admin metrics, users, campaigns, submissions and payouts |
| PATCH | `/api/admin/users/:id/ban` | Toggle user suspension |
| PATCH | `/api/admin/payouts/:id` | Mark payout as paid or reject/refund it |
| POST | `/api/admin/submissions/:id/test-views` | Set a test view count; disabled in production |

Admin payout body: `{ "action": "paid" }` or `{ "action": "reject" }`.

Test view body: `{ "views": 6000 }`.

## Health check

`GET /api/health` returns a small health response. It does not guarantee that external payment, email or social-platform integrations are available.
