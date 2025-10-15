# GPT Codex Hotel — Agent Guide

## Overview
- **Hotel shell**: Express 5 app in `src/` serving EJS views from `views/` with assets under `public/`. Sessions are persisted with SQLite via `src/middleware/session.js`. Socket.IO in `src/server.js` powers real-time chat and notifications.
- **Dining service**: TypeScript service under `src/dining/` started with `npm run dining:start`/`npm run dev`. It exposes `/api/dining` routes (proxied through the hotel app) and Socket.IO seat locking.
- **Persistence**: Local SQLite database created and seeded by `scripts/seed.js` using `better-sqlite3`. Models in `src/models/` wrap direct SQL queries.

## Key directories
- `src/routes/`: Express routers. `public.js` handles marketing pages, `booking.js` the multi-step wizard, `amenities.js` amenity listings, `auth.js` authentication, `dining.js` the dining UI bridge, and `admin*.js` admin portals.
- `src/middleware/`: Cross-cutting middleware (auth guards, CSRF, error handlers, session wiring).
- `src/services/`: Shared services such as dining seat locks, payments, notifications.
- `src/utils/`: Helpers (JWT utilities, booking calculators, sanitisation, constants).
- `src/dining/`: Dining API (TypeScript). `server.ts` wires HTTP + Socket.IO, `availability.ts` holds slot math, `holds.ts` manages reservation holds, and `client/` hosts the web client assets for dining overlays.
- `views/`: EJS templates for server-rendered pages. Subdirectories mirror route groupings (e.g. `booking/`, `dashboard/`, `partials/`).
- `public/`: Static assets served via Express (`css/`, `js/`, `images/`, icons, manifests).
- `tests/` & `cypress/`: Jest unit/integration coverage (`npm test`) and Cypress e2e specs (`npm run test:e2e`).

## Development workflow
1. Install deps: `npm install`.
2. Seed the SQLite DB whenever schemas/data change: `npm run seed`.
3. Start both services for local dev: `npm run hotel:dev` (Express + nodemon) and `npm run dining:dev` (tsx watch).
4. Key tests:
   - `npm test` — Jest (Node environment).
   - `npm run test:e2e` — Cypress (requires both servers, optionally set `SESSION_TOKEN_SECURE=false`).

## Implementation notes
- Server code uses CommonJS modules. TypeScript files rely on tsx runtime (`import` syntax).
- Input validation primarily uses Joi; sanitise strings via `src/utils/sanitize.js` before persisting.
- Auth is session + JWT hybrid. Always interact with `sessionMiddleware`/`hydrateUser` to access `req.user`.
- Chat logic (messages, attachments) is in `src/models/chat.js`; Socket handlers live in `src/server.js`.
- Dining API reuses the hotel JWT via `src/auth/verifySession.ts` and `src/dining/requireAdmin.ts`.
- When adding assets under `public/`, ensure CSP in `src/app.js` covers new external origins.
- Database schema/migrations are defined in `scripts/seed.js`. Update seed + rerun `npm run seed` after schema tweaks.

## Contributing tips
- Follow existing naming conventions and stick to descriptive helper functions.
- Keep middleware composable and avoid side effects in routers.
- Prefer dependency injection via Express `app.set()` for cross-module communication (e.g. Socket.IO instance).
- Update or create Jest/Cypress coverage for new features when practical.
- Remember to document new routes or flows in `README.md` if they affect onboarding or operations.
