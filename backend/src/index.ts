import express from "express";
import cors from "cors";
import { env } from "./config/env.config.js";
import analyzeRoutes from "./routes/analyze.routes.js";
import { connectDb } from "./config/db.config.js";

const app = express();
const PORT = env.PORT;

//middleware
app.use(cors());
app.use(express.json());

//request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

//routes
app.use("/api", analyzeRoutes);

//health check
app.get("/", (req, res) => {
  res.json({
    message: "VeriChain Backend",
    status: "running",
    endpoints: {
      health: "GET /api/health",
      analyze: "POST /api/analyze",
      batch: "POST /api/analyze/batch",
    },
  });
});

//404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.path,
  });
});

//start server
app.listen(PORT, async () => {
  console.log(`\nServer is up!`);
  await connectDb();
  console.log("Connected to database");
});