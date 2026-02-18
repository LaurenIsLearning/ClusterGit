
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import repoRoutes from "./routes/repos.js";
import commitRoutes from "./routes/commits.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Basic liveness routes
app.get("/", (req, res) => res.status(200).send("ClusterGit API is running"));
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/repos", repoRoutes);
app.use("/api/commits", commitRoutes);

const PORT = Number(process.env.PORT) || 80;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`ClusterGit API running on port ${PORT}`);
});

