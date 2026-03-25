import express from "express";
import { loadLatestNodeSnapshots } from "../utils/nodeTelemetry.js";

const router = express.Router();

router.get("/nodes", async (_req, res) => {
  try {
    const nodes = await loadLatestNodeSnapshots();
    res.set("Cache-Control", "no-store");
    return res.json({ nodes });
  } catch (error) {
    console.error("Public node telemetry error:", error);
    res.set("Cache-Control", "no-store");
    return res.json({ nodes: [] });
  }
});

export default router;
