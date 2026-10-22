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