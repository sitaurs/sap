# SAP Web

Next.js frontend for SAP. The `/api/v1` route proxies requests to the NestJS API from the server, keeping backend credentials out of browser code.

Run from the repository root with `npm run dev:web`. The backend runs separately with `npm run dev:api` and uses the ignored root `.env` file. For LAN access, follow the repository README and set the exact frontend URL in backend `APP_ORIGIN`.

Never commit `.env`, API keys, or transactional email provider credentials.
