-- CreateEnum
CREATE TYPE "NotifType" AS ENUM ('none', 'important_only', 'standard', 'frequent');

-- CreateEnum
CREATE TYPE "Interests" AS ENUM ('politics', 'health', 'finance', 'tech', 'sports', 'misc');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('text', 'image', 'video', 'link', 'mixed');

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('twitter', 'reddit', 'farcaster', 'other');

-- CreateEnum
CREATE TYPE "VerdictType" AS ENUM ('true_', 'false_', 'unclear');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('pending_ai', 'ai_evaluated', 'needs_vote', 'resolved', 'deferred');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('logic_consistency', 'citation_evidence', 'source_credibility', 'social_evidence', 'media_forensics', 'propagation_pattern');

-- CreateEnum
CREATE TYPE "UrgencyType" AS ENUM ('low', 'normal', 'high');

-- CreateEnum
CREATE TYPE "VotingStatus" AS ENUM ('open', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "NotifChannelType" AS ENUM ('in_app', 'email', 'push');

-- CreateEnum
CREATE TYPE "NotifStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "OnchainEventType" AS ENUM ('claim_registered', 'vote_cast', 'rewards_distributed', 'claim_resolved');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "wallet_address" TEXT,
    "password_hash" TEXT,
    "full_name" TEXT,
    "email" TEXT,
    "reddit_profile" TEXT,
    "x_profile" TEXT,
    "farcaster_profile" TEXT,
    "notif_type" "NotifType",
    "interests" "Interests"[],
    "reputation_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" SERIAL NOT NULL,
    "claim_uuid" UUID NOT NULL,
    "submitter_id" INTEGER NOT NULL,
    "raw_input" TEXT NOT NULL,
    "normalized_text" TEXT,
    "claim_type" "ClaimType",
    "platform" "PlatformType",
    "platform_post_id" TEXT,
    "platform_author" TEXT,
    "platform_url" TEXT,
    "extracted_urls" TEXT,
    "media_images" TEXT,
    "media_videos" TEXT,
    "ai_verdict" "VerdictType",
    "ai_confidence" DOUBLE PRECISION,
    "ai_flags" TEXT,
    "ai_explanation" TEXT,
    "final_verdict" "VerdictType",
    "final_confidence" DOUBLE PRECISION,
    "status" "ClaimStatus" NOT NULL DEFAULT 'pending_ai',
    "claim_hash" TEXT,
    "onchain_claim_tx" TEXT,
    "onchain_resolve_tx" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_results" (
    "id" SERIAL NOT NULL,
    "claim_id" INTEGER NOT NULL,
    "agent_name" "AgentType" NOT NULL,
    "verdict" "VerdictType",
    "confidence" DOUBLE PRECISION,
    "reasoning" TEXT,
    "flags" TEXT,
    "raw_result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting_sessions" (
    "id" SERIAL NOT NULL,
    "claim_id" INTEGER NOT NULL,
    "route_reason" TEXT,
    "urgency" "UrgencyType",
    "voting_window_secs" INTEGER,
    "min_votes_required" INTEGER,
    "status" "VotingStatus" NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closes_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "voting_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "claim_id" INTEGER NOT NULL,
    "voter_id" INTEGER NOT NULL,
    "choice" "VerdictType" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "staked_amount" DECIMAL(36,18),
    "onchain_vote_tx" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "claim_id" INTEGER,
    "session_id" INTEGER,
    "notif_type" "NotifChannelType" NOT NULL,
    "status" "NotifStatus" NOT NULL DEFAULT 'pending',
    "payload" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onchain_events" (
    "id" SERIAL NOT NULL,
    "claim_id" INTEGER,
    "tx_hash" TEXT NOT NULL,
    "event_type" "OnchainEventType" NOT NULL,
    "payload" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onchain_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "claims_claim_uuid_key" ON "claims"("claim_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "votes_session_id_voter_id_key" ON "votes"("session_id", "voter_id");

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_results" ADD CONSTRAINT "agent_results_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting_sessions" ADD CONSTRAINT "voting_sessions_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "voting_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "voting_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onchain_events" ADD CONSTRAINT "onchain_events_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;
