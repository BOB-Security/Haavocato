# Haavocato Complete Platform Rebuild

## Decision and non-negotiable constraints

- Build the replacement as a clean implementation on `rebuild/complete-platform`.
- Do not merge legacy application code into the replacement architecture.
- Keep `main` unchanged while discovery, implementation, data migration rehearsal, security review, and acceptance testing proceed.
- Reuse only verified business requirements, approved content, and necessary legacy data—not legacy UI or application implementation.
- Never put real client records, exported database dumps, credentials, API keys, OTPs, or session tokens in Git.
- Do not delete production data or remove the legacy application until migration verification, backup restoration testing, owner acceptance, and a rollback plan are complete.

## Repository discovery baseline (read-only inspection of `main`)

Observed in the repository:
- Node.js / Express application.
- Static public UI in `public/index.html`, `public/styles.css`, and `public/app.js`.
- A narrow admin UI in `public/admin.html`, `public/admin.css`, and `public/admin.js`.
- API and database initialization in `server.js`; admin activation/login logic in `admin-auth.js`.
- PostgreSQL tables created by application code: `consultation_requests` and `admin_auth`.
- Existing CI workflow runs syntax checks and smoke tests. Azure deployment workflow is triggered from `main`.
- Current intake persists a consultation request (name, email, phone, service, details, status, created timestamp) and returns its numeric ID as a reference. Current admin status values: `new`, `reviewing`, `contacted`, `closed`.
- No production database was accessed during this repository review. The existence, volume, accuracy, and backup state of live records remain unverified.

## Confirmed product requirements from the legal-services specification

### Languages and public website
- Arabic and English; English is the default interface.
- Public pages: Home, About Us, Legal Services, Our Partners, Legal Insights, Contact Us.
- Persistent `Book a Consultation` call to action.
- About content includes vision, mission, and values.
- Service content includes online legal consultations, contract review and drafting in Arabic/English, Arabic-English translation, legal courses (in preparation), company formation, and litigation/dispute services specified by the owner.
- Partner biographies/photos, official email/domain, social links, logo, and prior-work assets include items awaiting owner-provided/verified content.

### Client portal and service flow
- Client sign-up and login.
- Request a consultation or legal service.
- Securely upload supporting documents.
- Generate a reference number and let the client track request status.
- Book an available date/time for an online (video/phone) or in-person consultation.
- Payment options initially listed: Vodafone Cash, InstaPay, and bank transfer; card payments may be added later.
- Contact routes include email, phone, and WhatsApp.

## Target screen inventory

### Public website
1. Home.
2. About Us (vision, mission, values, team).
3. Legal Services (service catalogue and detail pages).
4. Our Partners.
5. Legal Insights (listing, article detail, categories/search as needed).
6. Contact Us.
7. Consultation booking entry point and availability selection.
8. Sign up, sign in, password recovery.
9. Client portal home.
10. New service/consultation request.
11. Secure document upload and document list.
12. Request details, reference number, status timeline, and communication history.
13. Appointment list, booking, rescheduling/cancellation rules.
14. Payment instructions / payment record / receipt or proof upload where applicable.
15. Profile, contact preferences, language, and session controls.
16. Privacy notice, terms, and legal disclaimer pages (content requires owner/legal approval).

### Professional admin dashboard
1. Secure admin/staff sign-in and account recovery.
2. Overview dashboard: request volume, status breakdown, upcoming appointments, payment reconciliation indicators, overdue tasks.
3. Consultation/service request queue with search, filters, assignment, priority, notes, status timeline.
4. Request detail workspace: client profile, service, files, internal notes, assigned staff/lawyer, appointments, payment status, communication history.
5. Clients and client profiles.
6. Appointment calendar and availability management.
7. Lawyers/partners/staff directory and assignment rules.
8. Service catalogue and service-specific intake requirements.
9. Documents: access-controlled listing, metadata, retention/deletion workflow, download audit.
10. Payments: method, expected amount (if configured), proof, review status, reconciliation; no card processing until explicitly implemented.
11. Website CMS: pages, services, partner profiles, legal insights/articles, bilingual content, publication state.
12. Notifications/templates and delivery history.
13. Users, roles, permissions, invitations, sessions.
14. Audit log for sensitive reads/writes, status changes, assignments, file access, and admin actions.
15. Operational settings: language defaults, contact routes, booking rules, notification settings.
16. Reports/export with permission checks and data-minimization controls.
17. Integration/configuration health and backup/restore status indicators.

The dashboard modules above are the target product design. Features not explicitly present in the original specification (for example role granularity, audit logs, retention workflows, reconciliation, and analytics) are implementation recommendations for a professional and secure legal-services platform; confirm business rules before finalizing them.

## Core business workflows

### A. New request
Public/client entry -> validate required fields -> create client/account relationship as appropriate -> create request and unique human-friendly reference -> securely store metadata -> notify authorized team -> triage -> assign responsible person -> update status and notify client -> close with outcome/record retention policy.

### B. Client identity and access
Sign up -> verify email/phone according to approved policy -> sign in -> session management -> access only the client's own profile, requests, appointments, payments, and files -> recovery flow -> revoke sessions when needed.

### C. Consultation appointment
Client selects consultation type (online video/phone or in-person) -> sees only available slots -> books slot -> prevents double booking transactionally -> sends confirmation/reminders -> authorized reschedule/cancel -> releases slot and records history.

### D. Secure document handling
Upload only permitted file types/sizes -> malware scanning/quarantine where available -> store outside public web root in private object storage -> authorize every read/download -> record access events -> associate document with client/request -> retention and deletion rules -> never expose private files through predictable public URLs.

### E. Payment recording
Select approved payment method -> show verified payment instructions -> client records payment/reference and optionally uploads proof -> authorized staff reviews and marks pending/confirmed/rejected/refunded -> record actor and timestamp -> notify client. Card processing is out of scope until explicitly approved and implemented with a compliant provider.

### F. Admin operations
Authenticated staff -> role/permission check per action -> work queue -> assignment and status transitions -> append audit event -> notify client where appropriate. Privileged actions require stronger controls than a shared admin password.

## Proposed technical direction (to validate during implementation)

- Keep the public web app and authenticated client/admin workspaces clearly separated by route and authorization boundary.
- Use a supported Node.js LTS runtime, a maintained application framework, PostgreSQL with versioned migrations, and automated tests.
- Store secrets only in deployment secret/configuration stores; use secure cookies, CSRF protection where applicable, rate limits, server-side validation, and least-privilege database credentials.
- Store client files in private object storage rather than the public static directory.
- Implement database migrations and a repeatable import script with dry-run mode, row counts, checksums/reconciliation, and idempotency.
- Add CI gates for lint/static checks, unit/integration tests, dependency/security checks, migration tests, and production build verification.
- Do not trigger production deployment from the rebuild branch. Use a separate preview/staging target with non-production data.

This is a proposed architecture, not a claim that these components have already been implemented or provisioned.

## Delivery gates

1. Requirements and legacy-data inventory reviewed.
2. Screen map, state transitions, data model, roles, and notification rules approved.
3. New application skeleton and database migrations implemented.
4. Public website and bilingual content implemented.
5. Client accounts, requests, files, appointments, and payment records implemented.
6. Admin modules, permissions, audit log, and CMS implemented.
7. Automated tests and security review passed.
8. Migration rehearsal completed using a protected staging database; source/target counts and samples reconciled.
9. Backup restoration and rollback procedure demonstrated.
10. Owner acceptance and production configuration review.
11. Controlled cutover: freeze legacy writes, final export, import, reconciliation, smoke tests, traffic switch.
12. Retain a protected rollback snapshot for the agreed retention period; delete legacy production artifacts only after explicit final sign-off.

## Open decisions / dependencies

- Confirm official public domain and Azure target, or choose a replacement hosting target.
- Confirm production database provider/access and who can authorize a read-only schema/record audit.
- Confirm staff roles and which actions each role may perform.
- Confirm appointment duration, working hours, timezone, buffer, reschedule/cancellation policy, and online meeting method.
- Confirm payment verification and receipt policy for each local payment method.
- Confirm document size/type limits, storage provider, retention period, and legal/privacy notices.
- Supply approved partner biographies/photos, official contact email, social URLs, logo, and any portfolio material.
