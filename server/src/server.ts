import "dotenv/config";
import cors from "cors";
import express from "express";
import { ROSTER_NAMES, ROSTER_ROLES } from "./roster.js";
import { CHAIN_KEYS, CHAIN_LABELS } from "./chains.js";
import { mockRouter } from "./routes/mock.js";
import { transactionsRouter } from "./routes/transactions.js";

const app = express();

// CORS_ORIGIN is a comma-separated list of allowed origins (e.g. the deployed
// Vercel frontend's URL). Left unset, CORS stays wide open — the same
// permissive default this app has always used for local dev, where the
// frontend's origin varies (localhost, LAN IP, etc.) and restricting it buys
// nothing.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",").map((o) => o.trim()) } : undefined));

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/roster", (_req, res) => {
  res.json({ names: ROSTER_NAMES, roles: ROSTER_ROLES });
});

app.get("/api/chains", (_req, res) => {
  res.json({ chains: CHAIN_KEYS.map((key) => ({ key, label: CHAIN_LABELS[key] })) });
});

app.use("/api/mock", mockRouter);
app.use("/api/transactions", transactionsRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
