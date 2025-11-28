import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
    path: path.resolve(__dirname, '../../.env')
});

export const env = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
    PORT: process.env.PORT || 3001,
    NODE_ENV: process.env.NODE_ENV || "development",
    LANGSMITH_TRACING: process.env.LANGSMITH_TRACING,
    LANGSMITH_ENDPOINT: process.env.LANGSMITH_ENDPOINT,
    LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY,
    LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT,
    SERP_API_KEY: process.env.SERP_API_KEY,
    SCRAPER_API_URL: process.env.SCRAPER_API_URL,
    GOOGLE_FACTCHECK_API_KEY: process.env.GOOGLE_FACTCHECK_API_KEY,
    CLAIMBUSTER_API_KEY: process.env.CLAIMBUSTER_API_KEY,
    REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
    REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
    REDDIT_REFRESH_TOKEN: process.env.REDDIT_REFRESH_TOKEN,
    NEYNAR_API_KEY: process.env.NEYNAR_API_KEY,
    HIVE_ACCESS_ID: process.env.HIVE_ACCESS_ID,
    HIVE_SECRET_KEY: process.env.HIVE_SECRET_KEY,
    SIGHTENGINE_API_USER: process.env.SIGHTENGINE_API_USER,
    SIGHTENGINE_API_SECRET: process.env.SIGHTENGINE_API_SECRET,
    DATABASE_URL: process.env.DATABASE_URL || '',
    RPC_URL: process.env.RPC_URL || "",
    PRIVATE_KEY: process.env.PRIVATE_KEY || "",
    CLAIM_REGISTRY_ADDRESS: process.env.CLAIM_REGISTRY_ADDRESS || "",
    STAKING_VOTING_ADDRESS: process.env.STAKING_VOTING_ADDRESS || "",
    NODEMAILER_USER: process.env.NODEMAILER_USER || "",
    NODEMAILER_PASSWORD: process.env.NODEMAILER_PASSWORD || "",
}