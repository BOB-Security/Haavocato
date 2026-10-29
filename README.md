# HA Advocates Legal Consultancy — Replacement Platform

This branch is a clean replacement implementation for the HA Advocates legal-services website and client operations workspace. It is intentionally isolated from `main`; do not deploy it to production until the acceptance gates in `docs/REBUILD_PLAN.md` are completed.

## Current implementation

- Public bilingual website (English default, Arabic available).
- Dedicated Home, About, Services, Partners, Legal Insights, and Contact pages.
- Published service catalogue backed by PostgreSQL.
- Client account registration with email verification and password recovery using Resend.
- Client portal for linked request tracking, public status timeline, appointment requests, payment-transfer records, and private document uploads.
- Admin workspace for request triage, appointment confirmation, availability rules, payment review, and bilingual CMS editing.
- Role/permission checks, revocable database-backed sessions, security headers, origin checks for browser mutations, rate limits, audit events, content revision snapshots, and a retrying email-notification queue.
- Transactional PostgreSQL migration runner with immutable SHA-256 checksums.

## Local setup

Requirements: Node.js 20 or newer and PostgreSQL 13 or newer.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and configure at minimum:
   - `DATABASE_URL`
   - `PGSSL` if your PostgreSQL service requires TLS
   - `PUBLIC_ORIGIN`
   - `SESSION_SECRET` (at least 32 random bytes in production)
   - `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for verification and reset messages

3. Apply database migrations to the intended empty/new database:

   ```sh
   npm run migrate
   ```

   The runner records applied migrations and refuses to continue if an applied migration file has changed. Do not point it at an existing production database without an approved migration and verified backup.

4. Create the first administrator once, using protected environment variables and the intended database:

   ```sh
   BOOTSTRAP_ADMIN_EMAIL=admin@example.com BOOTSTRAP_ADMIN_PASSWORD='use-a-unique-16-plus-character-secret' node scripts/bootstrap-admin.js
   ```

   Run the command in a secure shell or secret manager. Never commit real credentials. The bootstrap command refuses to create another super administrator or elevate an existing account.

5. Start the replacement application:

   ```sh
   npm start
   ```

   To process queued email notifications, run `npm run notifications:work` as a protected scheduled job or worker. It requires the Resend environment settings and database access.

   The site is served at `PUBLIC_ORIGIN`; staff workspace is at `/admin`, client workspace at `/portal`.

## Validation

Run before each review or deployment:

```sh
npm run check
npm test
```

The CI workflow runs syntax checks and automated tests on `rebuild/**` branches. A green syntax check alone does not establish production readiness; database integration, authorization, migration rehearsal, backup restoration, security review, and browser acceptance testing are required.

## Important boundaries / not yet production-ready

- Private legal-document upload uses an Azure Blob container configured to remain private. Uploads are quarantined by default; downloads remain blocked until a trusted scanner posts an authenticated result to `/api/integrations/documents/scan-result` using `DOCUMENT_SCAN_WEBHOOK_SECRET`. The scanner integration must be configured and tested before confidential documents are used in production. Do not send confidential files through the public form.
- Card payments are not processed. The current payment module records local transfers for staff review; it does not charge cards or provide official account instructions.
- Appointment slots depend on configured lawyer profiles and availability rules. Booking requests remain pending until staff confirms them.
- Published partner profiles, official email/social links, logo assets, office details, and approved legal article content must be supplied and verified by the firm.
- The CMS saves revisions and serves published partners/articles/pages through its content APIs. Static legal page copy remains partly specification-based and requires final owner/legal approval before launch.
- The real production database has not been inspected by this branch's implementation. No live records were migrated, and no production database was modified.
- Do not switch the production hostname, delete production data, or remove the legacy deployment until migration counts reconcile, a backup restore has been tested, owner acceptance is recorded, and a rollback path is ready.

## Key project documents

- `docs/REBUILD_PLAN.md` — product scope, delivery gates, architecture, dependencies.
- `docs/SCREEN_AND_WORKFLOW_MAP.md` — screen inventory and core workflows.
- `docs/LEGACY_DATA_AUDIT.md` — source-code data inventory and safe migration procedure.
- `db/migrations/` — versioned schema, role permissions, service catalogue, and auth/content migrations.
