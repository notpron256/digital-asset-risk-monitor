import "dotenv/config";
import cors from "cors";
import express from "express";
import { ROSTER_NAMES, ROSTER_ROLES } from "./roster.js";
import { CHAIN_KEYS, CHAIN_LABELS } from "./chains.js";
import { mockRouter } from "./routes/mock.js";
import { transactionsRouter } from "./routes/transactions.js";

const app = express();
app.use(cors());
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
  console.log(`Server listening on http://localhost:${port}`);
});
