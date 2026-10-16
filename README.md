# Edmonton Discovery

An Edmonton-first dining and event discovery app. Browsing and the Edmonton Member account are free for everyone while the product grows.

## Run locally

Requires Node.js 20 or newer. From this folder, run `npm start`, then open <http://127.0.0.1:4173>.

## Hosting and backend

Vercel serves the website from this repository. Firebase Authentication and Cloud Firestore provide the account and data backend; Firebase Auth handles password storage and email verification, and this app never stores passwords. The local Node server is only for local development and is excluded from Vercel deployments.

1. Create a Firebase project on the **Spark** (no-cost) plan. Choose a Firestore location close to Edmonton (for example, `northamerica-northeast1`); Firestore’s location cannot be changed later.
2. In **Authentication → Sign-in method**, enable **Email/Password** and **Google**. In **Authentication → Settings → Authorized domains**, add the Vercel domain after the first deployment and any custom domain you use.
3. Create the Firestore database in production mode.
4. Register a web app in **Project settings → Your apps**. Copy its web configuration into `firebase-config.js` (`apiKey`, `authDomain`, `projectId`, and `appId`). This web configuration is public by design; never put a service-account key or admin credential in the website.
5. Import `KishoreSaketi/edmonton-discovery` from the Vercel dashboard. Use the repository root, **Other** framework preset, no build command, and `.` as the output directory. The checked-in `vercel.json` configures this static deployment and response headers.
6. After adding the Vercel domain under Firebase Authentication’s **Authorized domains**, deploy the Firestore rules from this folder with the Firebase CLI: `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`.
7. To activate the listing editor, create the first account, copy its UID from **Authentication → Users**, then create `admins/{UID}` in Firestore with `{ "role": "admin" }`. Admin membership is granted by this document and cannot be self-assigned from the site.

The app’s Firebase web config is intentionally blank until project setup. With a valid config, authentication, verified-email gating, saved places/events, public verified corrections, and editor-only review use Firebase. User-submitted corrections remain private to the editor. If you switch from the old local Node backend, existing local accounts cannot be migrated with their passwords; users create new Firebase accounts.

Firebase Spark has usage limits and may stop serving requests when quotas are exceeded. Vercel’s free Hobby plan is limited to personal, non-commercial use; this marketplace will need a Vercel Pro or other eligible plan for commercial operation. Do not enter billing details or start a paid plan without reviewing the current price and usage settings.

## Restaurant links

When a direct menu or website could not be verified, the app now links to a location-specific Google Maps business profile instead of a broad search page. Restaurant-provided or source-confirmed links remain direct. Hours are presented as unconfirmed when the available sources only show delivery schedules or disagree.

## Account security and provider setup

- Passwords are one-way hashed with a per-account salt using Node scrypt; raw passwords are never written to the data store. New hashes use scrypt N=2^17, r=8, p=1. Legacy hashes are upgraded after a successful login.
- Email signup is unverified until a single-use, expiring link is used. Verification tokens are stored as SHA-256 hashes.
- Google uses the server-side authorization-code flow with state, nonce, PKCE, and verified ID-token signature and claim checks. The Google client secret stays server-side.
- Sessions use random HttpOnly, SameSite cookies. Production cookies require HTTPS (`NODE_ENV=production`).
- Data is stored locally in `data/store.json` with restrictive file permissions. The local server binds to loopback.

To enable actual verification emails, configure a verified sender and API key in Resend. To enable Google sign-in, create a Google OAuth Web application client and register `http://localhost:4173/auth/google/callback`. Copy `.env.example` to `.env`, then fill in `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_BASE_URL`. Keep `.env` private and restart the server. The app reports provider readiness in the sign-up screen. No credentials are included in this project.

With the local Node backend, suggestions are stored for review in each restaurant’s “Site editor” panel using `REPORTS_ADMIN_TOKEN`. In the Firebase backend, verified visitors submit suggestions to Firestore and only the account listed in `admins/{UID}` can review or publish them. GitHub Pages cannot run the Node server; without Firebase configuration, its report form opens a prefilled GitHub issue draft.

Accounts created before verification was implemented can continue to sign in but are clearly marked unverified; they can request verification once email delivery is configured. New email/password accounts must verify before login. Google sign-in verifies the Google email claim.

Before public launch, add account recovery, monitoring, distributed rate limiting, privacy/legal review, and an independent security review. Firebase Auth handles passwords, but the app operator can still change website code; restrict GitHub/Vercel deployment access and review changes carefully.

## Marketplace gaps

Live table availability and confirmed reservations need restaurant booking integrations. Ticket inventory, checkout, refunds, and transfer rules need event organizer or ticketing-provider integrations. The public directory cannot confirm current hours, availability, or ticket stock; event listings link to official information when the source provides a URL.

## Data source and updates

Dining listings come from City of Edmonton business licence records, which do not publish phone numbers or hours. Event listings link to official information when the source provides a URL. Dining data is in `data.js` from `data.edmonton.ca/resource/qhi4-bdpu.json`; events are from `data.edmonton.ca/resource/64u3-c7bh.json`. Update the `DINING`, `EVENTS`, and `SEED_DATE` constants when refreshing the dataset. Data in this repository was seeded in October 2026.

## Live page

GitHub Pages: <https://kishoresaketi.github.io/edmonton-discovery/>
