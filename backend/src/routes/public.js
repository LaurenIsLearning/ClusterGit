import express from "express";
import { loadLatestNodeSnapshots } from "../utils/nodeTelemetry.js";

const router = express.Router();

router.get("/nodes", async (_req, res) => {
  try {
    const nodes = await loadLatestNodeSnapshots();
    return res.json({ nodes });
  } catch (error) {
    console.error("Public node telemetry error:", error);
    return res.json({ nodes: [] });
  }
});

export default router;
