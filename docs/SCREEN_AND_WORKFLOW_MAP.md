# Haavocato Screen and Workflow Map

This is the first implementation map for the clean rebuild. It distinguishes source-confirmed requirements from recommended operational controls. Exact legal content, booking policy, staff roles, and retention periods require owner approval.

## Screen map

| Area | Screen | Primary actions | Access |
|---|---|---|---|
| Public | Home | Explore firm, choose language, start consultation | Public |
| Public | About Us | Read vision, mission, values, team | Public |
| Public | Legal Services | Browse categories and service details | Public |
| Public | Our Partners | View approved partner profiles | Public |
| Public | Legal Insights | Browse/search published articles | Public |
| Public | Contact Us | Contact by approved email, phone, WhatsApp; view office details when verified | Public |
| Identity | Sign up | Create account and accept approved terms/privacy notice | Public |
| Identity | Sign in | Authenticate and create secure session | Public |
| Identity | Account recovery | Verify one-time recovery challenge and reset password | Public |
| Client | Client home | View open requests, next appointment, pending actions | Authenticated client |
| Client | New request | Choose service, complete required intake, submit | Authenticated client; guest intake policy to confirm |
| Client | Request details | View reference, status timeline, public updates, next steps | Request owner only |
| Client | Documents | Upload/list/download permitted files for own request | Request owner only |
| Client | Book consultation | Choose online video/phone or in-person, available time, confirm booking | Authenticated client |
| Client | Appointments | View, request reschedule/cancellation, join online consultation | Appointment owner only |
| Client | Payments | View instructions, submit payment reference/proof, view payment state | Payment owner only |
| Client | Profile & preferences | Edit contact details, language, communication preference, sessions | Own account |
| Admin | Admin sign-in/recovery | Secure sign-in, recovery, session revocation | Staff/admin |
| Admin | Overview | KPIs, workload, upcoming appointments, pending payment reviews | Permissioned staff |
| Admin | Request queue | Search/filter, sort, triage, assign, set priority/status | Request permissions |
| Admin | Request workspace | View request, authorized client data/files, notes, status history, appointments, payment records | Request permissions |
| Admin | Clients | Search client, view profile and linked matters | Client-data permissions |
| Admin | Calendar & availability | Configure working slots, exceptions, bookings, reschedules | Calendar permissions |
| Admin | Team & partners | Manage internal users, public partner profiles, staff assignment | Team/profile permissions |
| Admin | Service catalogue | Edit bilingual service descriptions, intake fields, publish state | Content/service permissions |
| Admin | Document access | Inspect metadata, scan state, access history, retention actions | Restricted document permissions |
| Admin | Payments | Review proof, confirm/reject/refund status, reconcile records | Payment permissions |
| Admin | Content manager | Edit bilingual pages and articles, preview, publish/unpublish | CMS permissions |
| Admin | Notifications | Manage approved templates and delivery status | Notification permissions |
| Admin | Users & access | Invite/disable staff, assign roles, revoke sessions | Admin permission; high-risk actions audited |
| Admin | Audit log | Search privileged actions and security events | Restricted audit permission |
| Admin | Reports | Export permitted operational summaries with redaction/minimization | Reporting permission |
| Admin | Settings & integrations | Contact channels, booking policy, email provider health, storage/database health | Admin permission |

## Request state model

Proposed states (to confirm with the owner):
- `new`: submitted, not triaged.
- `triage`: staff is checking scope and completeness.
- `awaiting_client`: more information is required.
- `assigned`: a responsible lawyer/staff member is assigned.
- `in_progress`: work is underway.
- `awaiting_payment`: an approved payment action is required.
- `scheduled`: the next action is scheduled.
- `completed`: service delivery is complete.
- `declined`: the firm cannot accept the request.
- `cancelled`: request cancelled under approved policy.
- `archived`: retained in archive under approved access/retention policy.

Every state transition should validate allowed transitions, record actor/time, store an internal reason where needed, and create a separate client-visible message when the client should be notified. Do not expose internal notes or privileged data in the client timeline.

## Workflow A — request intake and tracking

1. Client selects a published service and language.
2. UI renders only the approved intake fields for that service.
3. Server validates fields and verifies identity/guest-intake policy.
4. Server creates a request, unique reference code, initial status event, and audit event in one transaction.
5. Client receives a confirmation and can view the reference in the portal; notify the assigned intake mailbox/team through configured channel.
6. Staff triages completeness and conflict/intake requirements according to the firm's approved procedure.
7. Staff assigns a responsible person and updates status; every transition is audited.
8. Client sees only client-safe status messages and requests for more information.
9. On completion/decline/cancellation, record the outcome and apply the approved retention policy.

## Workflow B — appointment scheduling

1. Client selects consultation mode: video, phone, or in-person.
2. Server returns only available slots for eligible staff and the configured timezone.
3. Client selects a slot; server re-checks availability inside a transaction to prevent double booking.
4. Booking and request linkage are saved together where applicable.
5. Confirmation and reminders are queued; delivery result is logged.
6. Rescheduling/cancellation validates the approved cutoff policy, releases old slot, creates history, and notifies relevant parties.
7. Completed/no-show status is recorded by authorized staff.

Meeting provider, consultation length, buffer time, office hours, holidays, and reschedule/cancellation cutoffs are unresolved policy decisions.

## Workflow C — document upload and review

1. Client chooses a request and uploads a permitted file.
2. Server enforces type, size, filename, and authorization checks; files are not written into the public web directory.
3. File is stored in private object storage; metadata/checksum are saved in PostgreSQL.
4. File remains pending/quarantined until the configured security scan passes.
5. Each view/download is authorized and audited.
6. Staff can request a replacement or mark a document reviewed; client sees only approved messages.
7. Retention/deletion follows a lawyer-approved policy, with legal hold support if required.

Storage vendor, permitted file types, size limit, scan provider, and retention periods need approval.

## Workflow D — local payment recording

1. Client sees current approved instructions for Vodafone Cash, InstaPay, or bank transfer.
2. Client submits a transaction reference and, if required, a private proof document.
3. Record starts as pending/submitted/under review.
4. A user with payment-review permission confirms or rejects it with an internal reason.
5. Request payment state is recalculated from payment records; client receives a safe status update.
6. Refunds/corrections are recorded as events rather than silently overwriting history.

Card processing remains a later optional integration and must not be represented as available until implemented and tested.

## Workflow E — CMS publication

Draft bilingual page/article/service -> validate required language content -> preview -> authorized approval -> publish -> record author/time -> allow unpublish/archive -> preserve revision/audit history.

## Workflow F — access and audit

- Every API endpoint checks authentication and resource ownership or the required permission.
- Client roles can access only their own profile, requests, appointments, payments, and documents.
- Staff access is limited by assigned role and matter scope where required.
- Administrative role grants, exports, document reads/downloads, status transitions, payment decisions, and configuration changes generate audit events.
- Rate-limit authentication and recovery; store only password hashes and hashed one-time tokens; revoke sessions on reset/disable.
- Do not include sensitive legal details, credentials, tokens, or file contents in logs.
