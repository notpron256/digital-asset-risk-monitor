import { Router } from "express";
import { submitOutbound, receiveInbound } from "../transactions.js";

export const mockRouter = Router();

mockRouter.post("/outbound", async (req, res) => {
  try {
    const { submittedBy, forceTier, forceSanctionsHit, address, amount, chain } = req.body ?? {};
    if (!submittedBy) {
      return res.status(400).json({ error: "submittedBy is required" });
    }
    const id = await submitOutbound(submittedBy, { forceTier, forceSanctionsHit, address, amount, chain });
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

mockRouter.post("/inbound", async (req, res) => {
  try {
    const { forceTier, forceSanctionsHit, address, amount, chain } = req.body ?? {};
    const id = await receiveInbound({ forceTier, forceSanctionsHit, address, amount, chain });
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
  }
});
