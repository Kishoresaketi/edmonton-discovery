# Edmonton Discovery

An Edmonton-first dining and events explorer built from City of Edmonton open data. Discovery is free for everyone while the community grows.

## What's included

- 2,987 dining listings across 313 Edmonton neighbourhoods
- Upcoming public events with event-page links where available
- Responsive discovery UI, search, neighbourhood filters, place details, and map directions
- Restaurant detail cards with sourced online information and a visitor correction workflow
- Optional account server for signup, email verification, Google sign-in, saved places, and saved events
- One free Edmonton Member account; no paid subscription or checkout

## GitHub Pages deployment

GitHub Pages serves the static files in this repository, so browsing, search, filters, events, and place details work there. Pages does **not** run `server.js`. The page detects this and disables account actions clearly until a backend is deployed; it does not pretend signup or email verification succeeded.

Set a long random `REPORTS_ADMIN_TOKEN` in the server environment to enable the in-app review queue. Suggestions are saved for review, and the site editor panel can verify and publish corrected address, hours, website, and menu details. GitHub Pages cannot run this backend; on the static page, the report form opens a prefilled GitHub issue draft instead. Visitors need to sign in to GitHub and submit that draft. Deploy the backend and connect the site to it for in-app review and publishing.

To enable accounts on the live site, deploy the included Node server to an application host and connect the website to it using a same-site custom domain/reverse proxy. Configure HTTPS, provider credentials, persistent storage and sessions, and CORS/CSRF policy for that deployment before enabling account actions. Do not point the public site at the local development server.

## Run the full app locally

Requires Node.js 20 or newer. From this folder, run:

```sh
npm start
```

Then open <http://127.0.0.1:4173>.

## Configure email verification and Google sign-in

Copy `.env.example` to `.env` and fill in the values locally. Never commit `.env` or share its secrets in chat.

- Email verification uses a verified Resend sender (`RESEND_API_KEY`, `EMAIL_FROM`). New email/password accounts cannot log in until they verify.
- Google sign-in uses a Google OAuth Web application (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). Register the exact callback `http://localhost:4173/auth/google/callback` for local development.
- `APP_BASE_URL` must match the app's public HTTPS origin when deployed.

The app reports when either provider is not configured; it does not claim an email was sent or a Google sign-in completed without the provider credentials.

## Security notes

Passwords are stored as salted one-way scrypt hashes; raw passwords are never written to the data store. New hashes use scrypt N=2^17, r=8, p=1. Legacy hashes are upgraded after successful login. Verification tokens are single-use, expire after 24 hours, and are stored as hashes. Google uses the server-side authorization-code flow with state, nonce, PKCE, and ID-token signature and claim checks. Sessions use random HttpOnly, SameSite cookies.

Existing accounts created before verification was implemented can continue to sign in but are marked unverified; they can request verification when email delivery is configured. New email/password accounts must verify before login. Google sign-in verifies Google's email claim.

The local server binds to loopback and is for prototyping. Before public launch, add a production database, durable sessions, HTTPS, account recovery, distributed rate limiting, monitoring, privacy/legal review, and an independent security review. A server operator can change application code; hashing protects stored password data but cannot technically prevent a malicious operator from changing code to capture passwords. For that trust boundary, use a reputable identity provider to handle passwords.

## Marketplace integrations still needed

Live table availability and confirmed reservations require restaurant booking integrations. Ticket inventory, checkout, refunds, and transfer rules require event organizer or ticketing-provider integrations. The public directory cannot confirm current hours, availability, or ticket stock; event listings link to official information where the source provides a URL.

## Data source

City of Edmonton Open Data. Dining listings come from business licence records, which do not publish phone numbers or hours.

## Updating the data

Dining data: `data.edmonton.ca/resource/qhi4-bdpu.json`. Events: `data.edmonton.ca/resource/64u3-c7bh.json`. The records are in `data.js`; update the `DINING`, `EVENTS`, and `SEED_DATE` constants. Data in this repo was seeded in October 2026.

## Live page

https://kishoresaketi.github.io/edmonton-discovery/
