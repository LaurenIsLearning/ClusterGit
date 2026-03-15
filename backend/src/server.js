import app from "./app.js";

//logging to watch Node
process.on("uncaughtException", err => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

const PORT = process.env.PORT || 80; //guarantees backend always starts

app.listen(PORT, () => {
  console.log(`ClusterGit API running on port ${PORT}`);
});
