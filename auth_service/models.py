import enum
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Enum
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func
from database import Base

class Interests(str, enum.Enum):
    tech = "tech"
    sports = "sports"
    misc = "misc"

class NotifType(str, enum.Enum):
    none = "none"
    important_only = "important_only"
    standard = "standard"
    frequent = "frequent"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    full_name = Column(String, nullable=True)
    
    # Auth fields - REMOVED as they don't exist in DB
    # password_hash = Column(String, nullable=True)
    # salt = Column(String, nullable=True)
    
    # Wallet fields
    wallet_address = Column(String, unique=True, index=True, nullable=True)
    
    # Social handles
    reddit_profile = Column(String, nullable=True)
    x_profile = Column(String, nullable=True)
    farcaster_profile = Column(String, nullable=True)
    
    # Onboarding fields
    interests = Column(ARRAY(Enum(Interests, name="Interests")), nullable=True)
    notif_type = Column(Enum(NotifType, name="NotifType"), nullable=True)
    
    # Metadata
    # auth_type column might not exist in DB based on \d output?
    # Let's check \d output again. It didn't show auth_type.
    # It showed: id, wallet_address, full_name, email, reddit_profile, x_profile, farcaster_profile, notif_type, interests, reputation_score, created_at, updated_at
    
    reputation_score = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    # is_active = Column(Boolean, default=True) # Not in DB output
