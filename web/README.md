# Curbstand web

Astro and React marketplace for Curbstand group buys. The layout follows a classifieds grid: search and filters, photo cards, and a group-buy detail page.

## Run locally

From `web/`:

Use Node.js 22.22.0 or newer.

```powershell
npm ci
npm run dev
```

From the repository root, use `npm ci --prefix web` and `npm run dev`.
Astro CLI commands use `npm run astro -- <command>`, for example
`npm run astro -- dev status`; `npm astro` is not a valid npm command.
If a development server is already running, open its URL or stop it with
`npm run astro -- dev stop` before starting another one or switching to demo mode.

Open http://127.0.0.1:4321/. The default data source is the API at `http://127.0.0.1:8787`. Start the API from the repository root with `npm start` after migrating and seeding the database.

Copy `web/.env.example` if you need to point at another API:

```
PUBLIC_DATA_SOURCE=api
PUBLIC_API_BASE=http://127.0.0.1:8787
```

`PUBLIC_DATA_SOURCE=fixtures` uses sample group buys in the browser and does not call the API. Playwright sets that value for its own dev server.

For a standalone demo, run `npm run demo` (or `npm run demo:web` from the repository root). No environment file or backend is needed. Changes persist across navigation and refresh in the same browser tab. A new tab starts a fresh fixture dataset.

Sign in with a seeded account. Any password is accepted because the API identifies the user with the `x-user-id` header, not a password check.

- maya@curbstand.test, customer
- jordan@curbstand.test, customer
- elena@curbstand.test, producer

New accounts in fixture mode can create, join, and bid according to their role. They can sign back in during the same browser-tab session using the same email and any nonempty password. Passwords are neither checked nor stored. In API mode, new registration is explicitly unavailable until auth endpoints exist.

Customers see created and joined requests; producers see their bids and open requests. Detail pages support joining, bidding, selecting a bid, cancelling, refreshing status, and marking fulfillment ready. Only the selected producer sees the fulfillment action. Fixture mode also supports organizer-controlled manual deposit records and participant/selected-producer manual pickup, including completed history. QR check-in is explicitly unavailable. API mode labels deposit and completion actions as awaiting backend support.

The current API listing only returns active requests, so the API dashboard cannot retrieve completed/cancelled history until a history endpoint is added. Fixture dashboards retain that history.

## Checks

```powershell
npm run check
npm test
```

`npm test` starts a separate Astro server on port 4322 with fixture data, alongside an existing development server. Tests cover desktop/mobile layouts, filters, validation, registration, login return paths, retry states, and the full create → join → bid → select → ready → manual pickup journey. Screenshots and reports are saved under `artifacts/`, which is excluded from source checks and Git. If Microsoft Edge is not installed at the configured Windows path, install the test browser once with `npx playwright install chromium` from `web/`.

Produce photos in `public/produce/` are square crops from Unsplash.
