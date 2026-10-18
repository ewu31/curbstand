# Curbstand frontend

Astro and React. From the repository root, run `npm ci --prefix web`, then
`npm run dev` to start the Docker API and frontend together. See the root
[README](../README.md) for setup, accounts, and server commands.

`npm run dev:web` runs only Astro. `PUBLIC_API_BASE` defaults to
`http://127.0.0.1:8787`; set it in `web/.env` for another API. The API must allow
the frontend origin in `CORS_ORIGINS`. Live mode uses bearer JWT authentication.

`npm run demo:web` uses independent browser fixtures. Its demo accounts are
maya@curbstand.test, jordan@curbstand.test, and elena@curbstand.test, with any
nonempty password. Fixture accounts do not authenticate against the live API.

Run `npm run check:web`, `npm run build:web`, and `npm run test:web` from the root.
