# Legacy Data Inventory and Migration Safety

## Scope

This document records only what can be established from repository source code. It does not claim access to a production database or prove that the live database contains only the tables described here.

## Source-code findings

### `consultation_requests`

Created in `server.js` with these columns:
- `id`: BIGSERIAL primary key.
- `full_name`: VARCHAR(120), required.
- `email`: VARCHAR(254), required.
- `phone`: VARCHAR(40), required.
- `service`: VARCHAR(120), required.
- `details`: TEXT, required.
- `status`: VARCHAR(20), required; allowed values `new`, `reviewing`, `contacted`, `closed`; default `new`.
- `created_at`: TIMESTAMPTZ, required; default current timestamp.

The public intake inserts into this table and returns `id` as the request reference. The admin interface lists up to 500 latest requests and can update status. No schema migration history, explicit foreign keys, client-account linkage, appointment records, document metadata, payment records, or notification history are defined in the inspected initialization code.

### `admin_auth`

Created in `admin-auth.js` with:
- `id` constrained to the single row 1.
- `password_hash`, `password_salt`.
- `otp_hash`, `otp_salt`, `otp_expires_at`, `otp_attempts`, `otp_purpose`.
- `updated_at`.

This table stores admin password hash/salt and temporary one-time-code hash/salt metadata. It should not be exported as ordinary business data. The replacement must create new admin identities and credentials through a secure setup flow; never migrate live password hashes or OTP/session artifacts unless a separately reviewed security decision explicitly requires it. Preferred default: invalidate old sessions and reset administrator credentials during cutover.

### Configuration and deployment references

- `.env.example` contains placeholder configuration, not real credentials.
- `server.js` and `admin-auth.js` read environment settings such as `DATABASE_URL`, `PGSSL`, `ADMIN_SESSION_SECRET`, and Resend settings.
- The Azure workflow deploys on pushes to `main`; the rebuild branch must not be connected to production deployment.
- Never copy secrets from deployment settings into repository files or migration artifacts.

## Data that may need preservation

Candidate business records to inspect after authorized read-only database access:
1. Consultation requests and their identifiers, timestamps, details, and current status.
2. Any tables, views, or external systems not declared by current source code (unknown until the actual database schema is inspected).
3. Approved business content/assets that are genuinely needed for launch and are not reproducible from the requirements source.

Do not presume that client data exists or that the code's current schema matches production exactly.

## Required authorized audit before migration

1. Identify the actual production database and confirm the responsible owner's authorization.
2. Take a protected database backup/snapshot; verify that a restore can be performed.
3. Inspect table names, columns, indexes, constraints, row counts, and database size using read-only access.
4. Check for orphaned/duplicate/inconsistent records without changing source data.
5. Record a data dictionary and mapping from each retained source field to the new schema.
6. Classify personal and confidential legal data; limit access to the migration team and use encrypted storage.
7. Never commit exports, real names, email addresses, phone numbers, legal matter details, document contents, credentials, or tokens to GitHub.
8. Implement import with dry-run mode, idempotency, transaction boundaries, row-level error report that avoids sensitive values, and a safe retry strategy.
9. Reconcile source and destination counts, key identifiers, timestamps, status mapping, and sampled records under authorized access.
10. Keep the source read-only through acceptance; no destructive deletion during development or rehearsal.

## Migration approach

- Define explicit mapping from legacy request statuses to the replacement workflow; do not silently rename states.
- Preserve the old request ID in a dedicated `legacy_reference` field if the new primary key differs.
- If existing numeric IDs become client-facing references, avoid collisions by generating a new opaque/human-friendly reference and retaining the legacy ID separately.
- Import business records only; do not import legacy sessions, OTPs, transient auth state, or secrets.
- Do not import confidential files until a separate file inventory and authorization/virus-scan/storage plan exists.
- Perform at least one staging rehearsal from a protected snapshot before the production cutover.
- Freeze legacy writes for the final export/import window, reconcile counts, perform smoke tests, and retain a protected rollback snapshot.
- Delete old application code from the active production deployment only after the replacement passes acceptance and the owner approves cutover. Retain protected backups according to the agreed policy; deletion of backups must be a separate, deliberate action.

## Unknowns that must not be guessed

- Whether a live database exists, where it is hosted, or whether it contains records.
- Actual live row counts and data quality.
- Whether other application versions or manual processes wrote additional tables.
- Whether any client documents exist outside PostgreSQL.
- Required retention/deletion periods for legal records and the applicable approved privacy policy.
