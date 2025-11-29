from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float, Numeric, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
import uuid
from .database import Base

# --- Enums ---
class NotifType(str, enum.Enum):
    none = "none"
    important_only = "important_only"
    standard = "standard"
    frequent = "frequent"

class Interests(str, enum.Enum):
    politics = "politics"
    health = "health"
    finance = "finance"
    tech = "tech"
    sports = "sports"
    misc = "misc"

class ClaimType(str, enum.Enum):
    text = "text"
    image = "image"
    video = "video"
    link = "link"
    mixed = "mixed"

class PlatformType(str, enum.Enum):
    twitter = "twitter"
    reddit = "reddit"
    farcaster = "farcaster"
    other = "other"

class VerdictType(str, enum.Enum):
    true_ = "true_"
    false_ = "false_"
    unclear = "unclear"

class ClaimStatus(str, enum.Enum):
    pending_ai = "pending_ai"
    ai_evaluated = "ai_evaluated"
    needs_vote = "needs_vote"
    resolved = "resolved"
    deferred = "deferred"

class AgentType(str, enum.Enum):
    logic_consistency = "logic_consistency"
    citation_evidence = "citation_evidence"
    source_credibility = "source_credibility"
    social_evidence = "social_evidence"
    media_forensics = "media_forensics"
    propagation_pattern = "propagation_pattern"

class UrgencyType(str, enum.Enum):
    low = "low"
    normal = "normal"
    high = "high"

class VotingStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    cancelled = "cancelled"

class NotifChannelType(str, enum.Enum):
    in_app = "in_app"
    email = "email"
    push = "push"

class NotifStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"

class OnchainEventType(str, enum.Enum):
    claim_registered = "claim_registered"
    vote_cast = "vote_cast"
    rewards_distributed = "rewards_distributed"
    claim_resolved = "claim_resolved"

# --- Models ---

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    reddit_profile = Column(String, nullable=True)
    x_profile = Column(String, nullable=True)
    farcaster_profile = Column(String, nullable=True)
    
    notif_type = Column(SAEnum(NotifType), default=NotifType.standard)
    interests = Column(SAEnum(Interests), nullable=True) 
    
    reputation_score = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Auth fields (Preserved for auth service functionality)
    password_hash = Column(String, nullable=True)
    
    # Relationships
    claims = relationship("Claim", back_populates="submitter")
    votes = relationship("Vote", back_populates="voter")
    notifications = relationship("Notification", back_populates="user")

class Claim(Base):
    __tablename__ = "claims"
    
    id = Column(Integer, primary_key=True, index=True)
    claim_uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    submitter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    raw_input = Column(Text, nullable=True)
    normalized_text = Column(Text, nullable=True)
    claim_type = Column(SAEnum(ClaimType), nullable=True)
    
    platform = Column(SAEnum(PlatformType), nullable=True)
    platform_post_id = Column(String, nullable=True)
    platform_author = Column(String, nullable=True)
    platform_url = Column(String, nullable=True)
    
    extracted_urls = Column(Text, nullable=True) # JSON string
    media_images = Column(Text, nullable=True) # JSON string
    media_videos = Column(Text, nullable=True) # JSON string
    
    ai_verdict = Column(SAEnum(VerdictType), nullable=True)
    ai_confidence = Column(Float, nullable=True)
    ai_flags = Column(Text, nullable=True) # JSON string
    ai_explanation = Column(Text, nullable=True)
    
    final_verdict = Column(SAEnum(VerdictType), nullable=True)
    final_confidence = Column(Float, nullable=True)
    
    status = Column(SAEnum(ClaimStatus), default=ClaimStatus.pending_ai)
    
    claim_hash = Column(String, nullable=True)
    onchain_claim_tx = Column(String, nullable=True)
    onchain_resolve_tx = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    
    submitter = relationship("User", back_populates="claims")
    agent_results = relationship("AgentResult", back_populates="claim")
    voting_sessions = relationship("VotingSession", back_populates="claim")
    votes = relationship("Vote", back_populates="claim")
    notifications = relationship("Notification", back_populates="claim")
    onchain_events = relationship("OnchainEvent", back_populates="claim")

class AgentResult(Base):
    __tablename__ = "agent_results"
    
    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False)
    agent_name = Column(SAEnum(AgentType), nullable=True)
    
    verdict = Column(SAEnum(VerdictType), nullable=True)
    confidence = Column(Float, nullable=True)
    flags = Column(Text, nullable=True) # JSON string
    raw_result = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    claim = relationship("Claim", back_populates="agent_results")

class VotingSession(Base):
    __tablename__ = "voting_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False)
    
    route_reason = Column(Text, nullable=True)
    urgency = Column(SAEnum(UrgencyType), nullable=True)
    voting_window_secs = Column(Integer, nullable=True)
    min_votes_required = Column(Integer, nullable=True)
    
    status = Column(SAEnum(VotingStatus), default=VotingStatus.open)
    
    opened_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closes_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    
    claim = relationship("Claim", back_populates="voting_sessions")
    votes = relationship("Vote", back_populates="session")
    notifications = relationship("Notification", back_populates="session")

class Vote(Base):
    __tablename__ = "votes"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("voting_sessions.id"), nullable=False)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False)
    voter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    choice = Column(SAEnum(VerdictType), nullable=True)
    confidence = Column(Float, nullable=True)
    
    staked_amount = Column(Numeric(36, 18), nullable=True)
    onchain_vote_tx = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    session = relationship("VotingSession", back_populates="votes")
    claim = relationship("Claim", back_populates="votes")
    voter = relationship("User", back_populates="votes")

class Notification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=True)
    session_id = Column(Integer, ForeignKey("voting_sessions.id"), nullable=True)
    
    notif_type = Column(SAEnum(NotifChannelType), nullable=True)
    status = Column(SAEnum(NotifStatus), default=NotifStatus.pending)
    
    payload = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    
    user = relationship("User", back_populates="notifications")
    claim = relationship("Claim", back_populates="notifications")
    session = relationship("VotingSession", back_populates="notifications")

class OnchainEvent(Base):
    __tablename__ = "onchain_events"
    
    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=True)
    tx_hash = Column(String, nullable=False)
    event_type = Column(SAEnum(OnchainEventType), nullable=True)
    payload = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    claim = relationship("Claim", back_populates="onchain_events")
