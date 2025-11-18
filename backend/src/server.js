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
// Register your API routes
app.use("/api/auth", authRoutes);
app.use("/api/repos", repoRoutes);
app.use("/api/commits", commitRoutes);
app.listen(process.env.PORT, () => {
console.log(`ClusterGit API running on port ${process.env.PORT}`);
});