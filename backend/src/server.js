
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import authRoutes from "./routes/auth.js";
import repoRoutes from "./routes/repos.js";
import commitRoutes from "./routes/commits.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health / test routes
app.get("/", (req, res) => {
  res.status(200).send("ClusterGit API is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/repos", repoRoutes);
app.use("/api/commits", commitRoutes);

// Port handling (important fix)
const PORT = process.env.PORT || 80;

app.listen(PORT, () => {
  console.log(`ClusterGit API running on port ${PORT}`);
});


