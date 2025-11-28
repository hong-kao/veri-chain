from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    full_name = Column(String, nullable=True)
    
    # Auth fields
    password_hash = Column(String, nullable=True)
    salt = Column(String, nullable=True)
    
    # Wallet fields
    wallet_address = Column(String, unique=True, index=True, nullable=True)
    
    # Social handles
    reddit_handle = Column(String, nullable=True)
    x_handle = Column(String, nullable=True)
    
    # Metadata
    auth_type = Column(String) # 'email', 'wallet', 'google', 'reddit'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=True)
