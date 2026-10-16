# Edmonton Discovery

An Edmonton-first dining and event discovery app. Browsing and the Edmonton Member account are free for everyone while the product grows.

## Run locally

Requires Node.js 20 or newer. From this folder, run `npm start`, then open <http://127.0.0.1:4173>.

## Production backend (Firebase Spark)

The static GitHub Pages copy does not run the Node server in this repository. For a hosted version with real sign-up, Google sign-in, saved lists, and correction review, use Firebase Authentication + Cloud Firestore + Firebase Hosting. Firebase Auth handles password storage and email verification; this app never receives or stores password hashes. Keep Firebase Security Rules deployed before sharing the site.

1. Create a Firebase project on the **Spark** (no-cost) plan. Choose a Firestore location close to Edmonton (for example, `northamerica-northeast1`); Firestore’s location cannot be changed later.
2. In **Authentication → Sign-in method**, enable **Email/Password** and **Google**. In **Authentication → Settings → Authorized domains**, add the Firebase Hosting domain and any custom domain you use.
3. Create the Firestore database in production mode.
4. Register a web app in **Project settings → Your apps**. Copy its web configuration into `firebase-config.js` (`apiKey`, `authDomain`, `projectId`, and `appId`). This web configuration is public by design; never put a service-account key or admin credential in the website.
5. From this folder, install the Firebase CLI if needed (`npm install --global firebase-tools`), sign in (`firebase login`), and deploy hosting and the included Firestore rules: `firebase deploy --only hosting,firestore:rules --project YOUR_PROJECT_ID`.
6. To activate the listing editor, create the first account, copy its UID from **Authentication → Users**, then create `admins/{UID}` in Firestore with `{ "role": "admin" }`. Admin membership is granted by this document and cannot be self-assigned from the site.

The app’s Firebase web config is intentionally blank until project setup. With a valid config, authentication, verified-email gating, saved places/events, public verified corrections, and editor-only review use Firebase. User-submitted corrections remain private to the editor. If you switch from the old local Node backend, existing local accounts cannot be migrated with their passwords; users create new Firebase accounts.

Firebase Spark has usage limits and may stop serving requests when quotas are exceeded. Confirm current limits and suitability before launch. Vercel’s free Hobby plan is limited to personal, non-commercial use, so it is not the deployment target for this marketplace.

## Restaurant links

When a direct menu or website could not be verified, the app now links to a location-specific Google Maps business profile instead of a broad search page. Restaurant-provided or source-confirmed links remain direct. Hours are presented as unconfirmed when the available sources only show delivery schedules or disagree.

## Account security and provider setup

- Passwords are one-way hashed with a per-account salt using Node scrypt; raw passwords are never written to the data store. New hashes use scrypt N=2^17, r=8, p=1. Legacy hashes are upgraded after a successful login.
- Email signup is unverified until a single-use, expiring link is used. Verification tokens are stored as SHA-256 hashes.
- Google uses the server-side authorization-code flow with state, nonce, PKCE, and verified ID-token signature and claim checks. The Google client secret stays server-side.
- Sessions use random HttpOnly, SameSite cookies. Production cookies require HTTPS (`NODE_ENV=production`).
- Data is stored locally in `data/store.json` with restrictive file permissions. The local server binds to loopback.

To enable actual verification emails, configure a verified sender and API key in Resend. To enable Google sign-in, create a Google OAuth Web application client and register `http://localhost:4173/auth/google/callback`. Copy `.env.example` to `.env`, then fill in `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_BASE_URL`. Keep `.env` private and restart the server. The app reports provider readiness in the sign-up screen. No credentials are included in this project.

With the Node backend, suggestions are stored for review in each restaurant’s “Site editor” panel. Set a long random `REPORTS_ADMIN_TOKEN` in the server environment and enter it there. The editor can verify suggestions, publish corrected address/hours/website/menu details, or decline them. GitHub Pages cannot run this server; on the static page, the report form opens a prefilled GitHub issue draft, which a visitor can sign in and submit. Deploy the backend and connect the app to it for in-app review and publishing.

Accounts created before verification was implemented can continue to sign in but are clearly marked unverified; they can request verification once email delivery is configured. New email/password accounts must verify before login. Google sign-in verifies the Google email claim.

This local prototype is not ready for public deployment. Before launch, add a production database, durable sessions, HTTPS, account recovery, monitoring, stronger distributed rate limiting, privacy/legal review, and a security review. A server operator can change application code; password hashing protects stored data but cannot technically prevent a malicious operator from changing code to capture passwords. For a stronger operator boundary, use a trusted identity provider to handle passwords.

## Marketplace gaps

Live table availability and confirmed reservations need restaurant booking integrations. Ticket inventory, checkout, refunds, and transfer rules need event organizer or ticketing-provider integrations. The public directory cannot confirm current hours, availability, or ticket stock; event listings link to official information when the source provides a URL.

## Data source and updates

Dining listings come from City of Edmonton business licence records, which do not publish phone numbers or hours. Event listings link to official information when the source provides a URL. Dining data is in `data.js` from `data.edmonton.ca/resource/qhi4-bdpu.json`; events are from `data.edmonton.ca/resource/64u3-c7bh.json`. Update the `DINING`, `EVENTS`, and `SEED_DATE` constants when refreshing the dataset. Data in this repository was seeded in October 2026.

## Live page

GitHub Pages: <https://kishoresaketi.github.io/edmonton-discovery/>
