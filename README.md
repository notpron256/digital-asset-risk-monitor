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
- **"Screen a real transaction" panel** (below Simulate): for a real address and amount you're actually considering sending (or a deposit you've actually received) — not a mock one. Pick the chain, enter the address and amount, and click **Screen Outbound** or **Screen Inbound** to get a real screening decision immediately (it opens the result automatically). This tool never connects to MetaMask, signs, or broadcasts anything — you read a real value out of your wallet, type it in here, get a decision, and act on it back in your wallet yourself.
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
