# Nigeria News Rewards — Render/PostgreSQL Edition

This version is prepared for GitHub + Render.

## What's changed

- Replaced local SQLite with PostgreSQL.
- Added PostgreSQL-backed login sessions.
- Added `/health` endpoint for Render health checks.
- Server binds to `0.0.0.0` and uses Render's `PORT`.
- Added `render.yaml` to provision the web service + PostgreSQL.
- Secrets are supplied through Render environment variables.
- Database tables are created automatically at startup.
- Added row locking/transactions around balances, withdrawals and upgrades.

## Deploy with Render Blueprint

1. Put the extracted project files in a GitHub repository.
2. In Render, choose **New → Blueprint** and select the repository.
3. Render reads `render.yaml`.
4. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` when prompted.
5. Deploy.
6. Your public site will be available on the Render `onrender.com` URL.

The Render Blueprint uses a managed Postgres database. This is preferable to relying on an ephemeral web-service filesystem for relational application data.

## Manual Render setup

If you don't use the Blueprint, create:
- a PostgreSQL database
- a Node Web Service connected to the GitHub repo

Build command:
npm install

Start command:
npm start

Environment variables:
NODE_ENV=production
DATABASE_URL=<Render Postgres connection string>
SESSION_SECRET=<long random secret>
ADMIN_EMAIL=<your admin email>
ADMIN_PASSWORD=<strong admin password>

## Admin

Open:
`/admin.html`

Use the `ADMIN_EMAIL` and `ADMIN_PASSWORD` configured in Render.

## Important production/security note

This is a deployable application starter, not a security/compliance audit. Before accepting real customer money, have the business model, payment/upgrade terms, reward claims, privacy/data handling, consumer protection, complaints/redress process and applicable Nigerian regulatory obligations reviewed by an appropriately qualified professional.

Do not describe the rewards as guaranteed investment returns. The site currently presents them as promotional rewards.

For production, also consider:
- professional payment gateway integration
- email/SMS verification
- rate limiting
- CSRF protection for state-changing browser requests
- stronger admin authentication (preferably MFA)
- audit logs
- upload storage for payment proofs rather than plain text
- proper privacy policy and terms
- backups and monitoring
- licensed/verified news content


## New visual design
The public pages and dashboard now use a polished Nigerian-green + gold visual theme, responsive cards, improved forms, modern navigation, stronger typography, and mobile-friendly layouts.

## Render business settings
Set these in Render Environment Variables instead of committing bank/account details:
- BANK_NAME
- BANK_ACCOUNT_NUMBER
- BANK_ACCOUNT_NAME
- WHATSAPP_NUMBER
- FREE_REWARD
- LEGEND_REWARD
- LEGEND_FEE
- MIN_WITHDRAWAL
- REFERRAL_BONUS
