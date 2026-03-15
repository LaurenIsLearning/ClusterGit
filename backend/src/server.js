import app from "./app.js";

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

const PORT = process.env.PORT || 80;

app.listen(PORT, () => {
  console.log(`ClusterGit API running on port ${PORT}`);
}).on('error', (err) => {
  console.error('Listen error:', err);
  process.exit(1);
})
