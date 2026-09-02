# digital-asset-risk-monitor

A proof-of-concept pre-transaction risk screening tool: simulated (or manually entered, real) outbound withdrawals and inbound deposits are screened against a real on-chain sanctions oracle — supporting Ethereum, Arbitrum, and BNB Smart Chain — plus a mock provenance score, then auto-cleared, routed to an ops manager, or routed to a compliance manager depending on risk tier. See [`intent/intent-001.md`](intent/intent-001.md) and [`spec/spec-001.md`](spec/spec-001.md) for the full design. See [`REVIEW.md`](REVIEW.md) for the review policy applied to changes in this project.

The app has two parts you run separately: `server` (Node/Express/TypeScript backend + Postgres) and `client` (React/TypeScript frontend, Vite).

## Prerequisites

- **Node.js 18 or later** and npm (check with `node --version`).
- **A Postgres database.** This project is built against a free-tier hosted instance — [Neon](https://neon.tech) or [Supabase](https://supabase.com) both work. Create a project on either, then copy its Postgres connection string (Neon calls this the "connection string"; Supabase shows it under Project Settings → Database → Connection string — use the one labeled for `psql`/direct connections, not the pooler-only one if given a choice, though the pooler URL also works). It should look like:
  ```
  postgresql://<user>:<password>@<host>/<database>?sslmode=require
  ```

Nothing else needs installing up front — the app runs in stub mode with no other setup.

## 1. Set up the server

```
cd server
npm install
cp .env.example .env
```

Open `server/.env` in an editor and fill in `DATABASE_URL` with the connection string from the Prerequisites step:

```
DATABASE_URL=postgresql://your-actual-connection-string-here
```

Leave `RPC_URL`, `RPC_URL_ARBITRUM`, and `RPC_URL_BSC` blank for now — the app runs fully in "stub" mode without them (every sanctions check is clearly labeled `STUB` instead of `LIVE`, no external calls made). This is per-chain: you can enable live checks for one chain and leave the others as stub. See **Enabling live sanctions checks** below if you want the real on-chain check.

Now create the database tables:

```
npm run migrate
```

Expected output ends with `Migrations complete.` If it errors, the most likely cause is `DATABASE_URL` being wrong or the database not accepting connections yet (hosted free-tier databases can take a minute to wake up after creation).

Start the backend:

```
npm run dev
```

Expected output:
```
Server listening on http://localhost:4000
```

Leave this running. Open **http://localhost:4000/api/health** in a browser — you should see:
```json
{"status":"ok"}
```

If you see that, the backend is fully working. Keep this terminal open.

## 2. Set up the client

Open a **second terminal** (leave the server running in the first one):

```
cd client
npm install
cp .env.example .env
npm run dev
```

Expected output includes a line like:
```
➜  Local:   http://localhost:5173/
```

Open **http://localhost:5173** in a browser. You should see a sidebar on the left with "Name" and "Role" dropdowns, and a "Transactions" panel on the right with a "Simulate" box above it.

The client's `.env` (`VITE_API_BASE_URL=http://localhost:4000`) only needs changing if you changed the server's `PORT`.

## 3. Using the app

- **Sidebar**: choose which person and role you're acting as. The roster (Alice, Bob, Carol, Dave) and roles (Ops, Ops Manager, Compliance Manager) are fixed for this POC — there's no real login. Any name can act as any role; this stands in for real authentication (a production version would use something like Clerk with email-verified identity per role).
- **Simulate panel**: click **Simulate Outbound** or **Simulate Inbound** to generate a mock transaction. Controls:
  - **Chain**: Ethereum, Arbitrum, or BNB Smart Chain — determines which network's sanctions oracle actually gets queried.
  - **Force tier**: pin the mock risk score to Low/Medium/High instead of letting it fall out naturally from the (randomly generated, unless you specify one) address.
  - **Force sanctions hit**: forces a sanctions match for testing. This always shows as `STUB` in the result, even with live checks enabled, because forcing a result means no real check was actually made.
  - **Address**: leave blank for a random address each time, or type/paste a specific one — reusing the same address **on the same chain** lets you see the 24-hour screening cache kick in (the second screen shows "cache" instead of "fresh"). The cache is per address+chain, so the same address on a different chain always screens fresh.
- **"Screen a real transaction" panel** (below Simulate): for a real address you're actually considering sending to (or a deposit you've actually received) — not a mock one. Pick the chain, enter the address, and click **Screen Outbound** or **Screen Inbound** to get a real screening decision immediately (it opens the result automatically). This tool never connects to MetaMask, signs, or broadcasts anything — you read a real address out of your wallet, type it in here, get a decision, and act on it back in your wallet yourself. There's no amount field — screening is address-only, since amount was never a scoring input (see `spec.md`'s Areas of concern #15).
- **Transaction list**: click any row to open its detail view — full screening evidence (mock score, simulated risk factors, sanctions check result, which chain was queried), review history, and, if the transaction is awaiting review and your selected role/name are the assigned reviewer, Approve/Escalate/Reject buttons.
- Ops Manager can Approve or Escalate (never Reject — blocking a transaction always requires compliance authority). Compliance Manager can Approve or Reject. A reviewer can never act on a transaction they themselves submitted (the four-eyes rule) — the buttons will show as disabled with an explanation if you try.

## Enabling live sanctions checks

Each supported chain (Ethereum, Arbitrum, BNB Smart Chain) has its own RPC env var in `server/.env`, and each is independently optional — leaving one unset runs just that chain in stub mode (no external call, results clearly labeled `STUB`), regardless of what the others are set to:

```
RPC_URL=https://ethereum.publicnode.com          # Ethereum (RPC_URL is a legacy name; still works)
RPC_URL_ARBITRUM=https://arb1.arbitrum.io/rpc    # Arbitrum
RPC_URL_BSC=https://bsc-dataseed.binance.org     # BNB Smart Chain
```

Any Ethereum-JSON-RPC-compatible HTTPS endpoint for that chain works — the values above are free public RPCs with no signup. A free-tier Alchemy or Infura URL also works per chain if you want more reliability — just paste it into the matching variable, no code changes needed.

To enable a chain:

1. Set that chain's RPC env var in `server/.env` (see above).
2. Restart the server (`.env` is only read on startup — stop it with Ctrl+C and run `npm run dev` again; a running server won't pick up an edited `.env` on its own).
3. In the Simulate panel or "Screen a real transaction" panel, pick that chain and use a **fresh, never-before-used address on that chain** (an already-used one may return a cached result from before you enabled this). Its detail view should now show `LIVE` instead of `STUB`, along with a multi-provider cross-check summary and which chain was queried.

See `spec/spec-001.md`'s Areas of concern for the known limitations of this free oracle (data freshness and coverage are not guaranteed, and apply to all three chains — see items 12–14).

## Ports

- Backend: `4000` by default (`PORT` in `server/.env`).
- Frontend: `5173` (Vite's default; not configured via `.env`).

## Deployment

This app is designed to deploy as: **backend on [Render](https://render.com)**, **frontend on [Vercel](https://vercel.com)**, **database on [Neon](https://neon.tech)** (already set up for local dev — the same instance can be reused). Deployment itself is done manually through each platform's dashboard; nothing here deploys automatically.

### Backend (Render)

- **Root directory**: `server`
- **Build command**: `npm ci && npm run build`
- **Start command**: `npm start` (runs the compiled `dist/server.js`, not the dev server)
- **Environment variables** (set in Render's dashboard, under the service's Environment tab):
  - `DATABASE_URL` — the Neon connection string.
  - `CORS_ORIGIN` — the deployed Vercel frontend's URL (e.g. `https://your-app.vercel.app`). Comma-separate multiple values if you need to allow more than one (e.g. a production domain plus a Vercel preview URL). **Leave this set** in production — leaving it unset makes the API accept requests from any origin, which is only the right default for local dev.
  - `RPC_URL` (or `RPC_URL_ETHEREUM`), `RPC_URL_ARBITRUM`, `RPC_URL_BSC` — optional, same as local dev. Leaving any of these unset runs that chain in stub mode.
  - Do **not** set `PORT` manually — Render assigns it automatically, and the app already reads `process.env.PORT`.
- Render will run a health check against the service; `GET /api/health` (already implemented) works for this.
- Run `npm run migrate` once against the Neon database before first use, if you haven't already (from your local machine with `DATABASE_URL` pointed at it works fine — the migration doesn't need to run on Render itself).

### Frontend (Vercel)

- **Root directory**: `client`
- **Build command**: `npm run build` (Vite's default)
- **Output directory**: `dist` (Vite's default)
- **Environment variable** (set in Vercel's dashboard, under the project's Environment Variables): `VITE_API_BASE_URL` — the deployed Render backend's URL (e.g. `https://your-app.onrender.com`). This must be set **before building** — Vite bakes `VITE_`-prefixed variables into the built JavaScript at build time, it does not read them at runtime, so changing it later requires a rebuild/redeploy, not just an env var update.

### After deploying

Render and Vercel will each generate a URL before the other side knows about it, so there's an unavoidable order-of-operations step: deploy the backend first, note its Render URL, set that as `VITE_API_BASE_URL` in Vercel and deploy the frontend, note *its* Vercel URL, then go back and set that as `CORS_ORIGIN` in Render and redeploy (or manually restart) the backend so CORS actually accepts it.

To verify: open the deployed frontend and confirm the dashboard loads transactions with no "Failed to fetch" or CORS errors in the browser console — that specific failure mode means either `VITE_API_BASE_URL` is wrong/missing, or `CORS_ORIGIN` on the backend doesn't (yet) match the frontend's real URL.
