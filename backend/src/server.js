import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import authRoutes from "./routes/auth.js";
import repoRoutes from "./routes/repos.js";
import commitRoutes from "./routes/commits.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/healthz", (req, res) => res.status(200).send("ok"));

app.use("/api/auth", authRoutes);
app.use("/api/repos", repoRoutes);
app.use("/api/commits", commitRoutes);

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`ClusterGit API running on port ${PORT}`);
});

