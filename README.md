# Haavocato

Bilingual Arabic/English starter for the Haavocato legal-services platform.

## Current scope

- Responsive public landing page with Arabic and English content.
- Service overview and consultation request form.
- Node.js/Express server with security headers, request-size limits, rate limiting, input validation, and a health endpoint.
- PostgreSQL persistence for consultation requests when `DATABASE_URL` is configured.
- GitHub Actions validation workflow and an Azure App Service deployment workflow.

## Run locally

Requirements: Node.js 22+ and PostgreSQL.

```bash
cp .env.example .env
npm install
npm run check
npm test
npm start
```

Set `DATABASE_URL` in the environment before starting if you want consultation requests to be saved. Do not commit real secrets or database credentials.

Health check: `GET /api/health`.

## Azure App Service deployment

The workflow at `.github/workflows/azure-deploy.yml` deploys the `main` branch after the repository is configured with:

- Repository variable `AZURE_WEBAPP_NAME`: the dedicated Haavocato Azure Web App name.
- Repository secret `AZURE_WEBAPP_PUBLISH_PROFILE`: the publish profile downloaded from that exact Azure Web App.
- App Service application setting `DATABASE_URL`: PostgreSQL connection string.
- App Service application setting `PGSSL=true` when the database requires TLS.
- App Service application setting `NODE_ENV=production`.

Use a dedicated Haavocato app; do not point this workflow at the unrelated ATSH-AI company website. Configure PostgreSQL with TLS and restricted network access before accepting real client requests.

## Important limitations

This is the initial public-site and consultation-intake foundation, not the completed legal-services management platform. Customer accounts, staff/admin roles, appointment scheduling, private document storage, notifications, audit trails, and production data-retention controls still require implementation and verification. Do not upload confidential client documents until those controls are in place.

The product reference `PRODUCT_REFERENCE_LEGAL_SERVICES_AR.md` is retained unchanged.

## Admin dashboard authentication

The dashboard owner email defaults to `hazem.mustafa17@gmail.com` (optional override: `ADMIN_EMAIL`). First-time activation and password reset send a six-digit, single-use code to this mailbox; codes expire after 10 minutes and allow at most five attempts. The owner chooses a permanent password of at least 12 characters, stored as a salted scrypt hash.

Configure these App Service environment variables in Azure:
- `DATABASE_URL`: PostgreSQL connection string.
- `ADMIN_SESSION_SECRET`: random secret at least 32 characters.
- `RESEND_API_KEY`: Resend API key.
- `RESEND_FROM_EMAIL`: sender address verified with Resend.
- `NODE_ENV=production`; `PGSSL=true` if the database provider requires TLS.

Email activation/reset is not operational until the database is available, the sender is verified in Resend, and all required settings are supplied. Keep all secrets out of GitHub and chat.\n

The Arabic admin dashboard is available at `/admin.html`. Before using it, configure these App Service application settings in Azure (Configuration → Application settings), then restart the app:

- `ADMIN_USERNAME`: your chosen admin login name.
- `ADMIN_PASSWORD`: a strong, unique password; do not commit it to GitHub or share it in chat.
- `ADMIN_SESSION_SECRET`: a random secret of at least 32 characters, kept private.
- `DATABASE_URL`: PostgreSQL connection string for saving and listing consultation requests.
- `PGSSL=true` when your PostgreSQL provider requires TLS.
- `NODE_ENV=production`.

The dashboard uses an eight-hour signed, HttpOnly session cookie, limits login attempts, and requires authentication for listing requests or changing their status. If PostgreSQL is not configured, the dashboard can show the login page but cannot load or save consultation requests. Do not use real client data until database access, backups, and privacy controls have been verified.
