import express from "express";
import cors from "cors";
import { env } from "./config/env.config.js";
import analyzeRoutes from "./routes/analyze.routes.js";
import claimRoutes from "./routes/claim.routes.js";
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

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

//routes
app.use("/api", analyzeRoutes);
app.use("/api/claims", claimRoutes);

//health check
app.get("/", (req, res) => {
  res.json({
    message: "VeriChain Backend API",
    status: "running",
    version: "2.0.0",
    endpoints: {
      health: "GET /api/health",
      submitClaim: "POST /api/claims/submit",
      claimStatus: "GET /api/claims/:claimId/status",
      claimDetails: "GET /api/claims/:claimId",
      // Legacy endpoints
      analyze: "POST /api/analyze",
      batch: "POST /api/analyze/batch"
    },
    agents: {
      textForensics: "✅ Working",
      citation: "✅ Working",
      sourceCred: "✅ Working",
      socialEvidence: "✅ Working",
      mediaForensics: "✅ Working",
      pattern: "✅ Working",
      scoring: "✅ Working",
      orchestrator: "✅ Ready"
    }
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