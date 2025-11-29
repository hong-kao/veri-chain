-- Drop existing tables and types to ensure a clean slate
DROP TABLE IF EXISTS onchain_events CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS votes CASCADE;
DROP TABLE IF EXISTS voting_sessions CASCADE;
DROP TABLE IF EXISTS agent_results CASCADE;
DROP TABLE IF EXISTS claims CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS onchaineventtype CASCADE;
DROP TYPE IF EXISTS notifstatus CASCADE;
DROP TYPE IF EXISTS notifchanneltype CASCADE;
DROP TYPE IF EXISTS votingstatus CASCADE;
DROP TYPE IF EXISTS urgencytype CASCADE;
DROP TYPE IF EXISTS agenttype CASCADE;
DROP TYPE IF EXISTS claimstatus CASCADE;
DROP TYPE IF EXISTS verdicttype CASCADE;
DROP TYPE IF EXISTS platformtype CASCADE;
DROP TYPE IF EXISTS claimtype CASCADE;
DROP TYPE IF EXISTS interests CASCADE;
DROP TYPE IF EXISTS notiftype CASCADE;

-- Create Enums
CREATE TYPE notiftype AS ENUM ('none', 'important_only', 'standard', 'frequent');
CREATE TYPE interests AS ENUM ('politics', 'health', 'finance', 'tech', 'sports', 'misc');
CREATE TYPE claimtype AS ENUM ('text', 'image', 'video', 'link', 'mixed');
CREATE TYPE platformtype AS ENUM ('twitter', 'reddit', 'farcaster', 'other');
CREATE TYPE verdicttype AS ENUM ('true_', 'false_', 'unclear');
CREATE TYPE claimstatus AS ENUM ('pending_ai', 'ai_evaluated', 'needs_vote', 'resolved', 'deferred');
CREATE TYPE agenttype AS ENUM ('logic_consistency', 'citation_evidence', 'source_credibility', 'social_evidence', 'media_forensics', 'propagation_pattern');
CREATE TYPE urgencytype AS ENUM ('low', 'normal', 'high');
CREATE TYPE votingstatus AS ENUM ('open', 'closed', 'cancelled');
CREATE TYPE notifchanneltype AS ENUM ('in_app', 'email', 'push');
CREATE TYPE notifstatus AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE onchaineventtype AS ENUM ('claim_registered', 'vote_cast', 'rewards_distributed', 'claim_resolved');

-- Create Tables

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR NOT NULL UNIQUE,
    full_name VARCHAR,
    email VARCHAR,
    reddit_profile VARCHAR,
    x_profile VARCHAR,
    farcaster_profile VARCHAR,
    notif_type notiftype DEFAULT 'standard',
    interests interests,
    reputation_score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    password_hash VARCHAR -- Added for Auth Service compatibility
);

CREATE TABLE claims (
    id SERIAL PRIMARY KEY,
    claim_uuid UUID NOT NULL UNIQUE,
    submitter_id INTEGER NOT NULL REFERENCES users(id),
    raw_input TEXT,
    normalized_text TEXT,
    claim_type claimtype,
    platform platformtype,
    platform_post_id VARCHAR,
    platform_author VARCHAR,
    platform_url VARCHAR,
    extracted_urls TEXT, -- JSON string
    media_images TEXT,   -- JSON string
    media_videos TEXT,   -- JSON string
    ai_verdict verdicttype,
    ai_confidence FLOAT,
    ai_flags TEXT,       -- JSON string
    ai_explanation TEXT,
    final_verdict verdicttype,
    final_confidence FLOAT,
    status claimstatus DEFAULT 'pending_ai',
    claim_hash VARCHAR,
    onchain_claim_tx VARCHAR,
    onchain_resolve_tx VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE agent_results (
    id SERIAL PRIMARY KEY,
    claim_id INTEGER NOT NULL REFERENCES claims(id),
    agent_name agenttype,
    verdict verdicttype,
    confidence FLOAT,
    flags TEXT, -- JSON string
    raw_result TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE voting_sessions (
    id SERIAL PRIMARY KEY,
    claim_id INTEGER NOT NULL REFERENCES claims(id),
    route_reason TEXT,
    urgency urgencytype,
    voting_window_secs INTEGER,
    min_votes_required INTEGER,
    status votingstatus DEFAULT 'open',
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    closes_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE votes (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES voting_sessions(id),
    claim_id INTEGER NOT NULL REFERENCES claims(id),
    voter_id INTEGER NOT NULL REFERENCES users(id),
    choice verdicttype,
    confidence FLOAT,
    staked_amount NUMERIC(36, 18),
    onchain_vote_tx VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    claim_id INTEGER REFERENCES claims(id),
    session_id INTEGER REFERENCES voting_sessions(id),
    notif_type notifchanneltype,
    status notifstatus DEFAULT 'pending',
    payload TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE onchain_events (
    id SERIAL PRIMARY KEY,
    claim_id INTEGER REFERENCES claims(id),
    tx_hash VARCHAR NOT NULL,
    event_type onchaineventtype,
    payload TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Indexes (Implicitly created for PKs and UNIQUEs, adding explicit ones from schema request if any)
CREATE INDEX ix_users_wallet_address ON users(wallet_address);
CREATE INDEX ix_users_id ON users(id);
CREATE INDEX ix_claims_id ON claims(id);
CREATE INDEX ix_claims_claim_uuid ON claims(claim_uuid);
CREATE INDEX ix_votes_claim_id ON votes(claim_id);
CREATE UNIQUE INDEX ix_votes_session_voter ON votes(session_id, voter_id);
