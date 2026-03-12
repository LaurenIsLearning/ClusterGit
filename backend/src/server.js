import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import authRoutes from "./routes/auth.js";
import repoRoutes from "./routes/repos.js";
import commitRoutes from "./routes/commits.js";

const app = express();

// Trust proxy for correct protocol detection (e.g. https) behind Cloudflare/Load Balancers
app.set("trust proxy", true);

//logging to watch Node
process.on("uncaughtException", err => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", err => {
  console.error("Unhandled Rejection:", err);
});

app.use(cors({
  origin: function (origin, callback) {
    // Allow non-browser requests (curl, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "https://clustergit.com",
      "http://localhost:5173"
    ];

    // Allow all Cloudflare preview deployments
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith(".clustergit.pages.dev") ||
      origin.endsWith(".clustergit.com")
    ) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

app.use((req, res, next) => {
  // Pass Git HTTP requests to repo handler WITHOUT body parsing
  if (req.path.includes('.git')) {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Mount at root for professional URLs (e.g. /username/repo.git)
app.use("/", repoRoutes);

app.get("/", (req, res) => {
  res.send("ClusterGit backend is alive");
});

// Register your API routes
app.use("/api/auth", authRoutes);
app.use("/api/repos", repoRoutes);
app.use("/api/commits", commitRoutes);

// Error handler (helps with white screen)
app.use((err, req, res, next) => {
  console.error("API error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 8080; //guarantees backend always starts

app.listen(PORT, () => {
  console.log(`ClusterGit API running on port ${PORT}`);
});
//rebuild
// trigger deploy 14