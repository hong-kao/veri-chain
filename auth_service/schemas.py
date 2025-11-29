from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from typing import Optional, List

class UserBase(BaseModel):
    wallet_address: str
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    reddit_profile: Optional[str] = None
    x_profile: Optional[str] = None
    farcaster_profile: Optional[str] = None
    notif_type: Optional[str] = "standard"
    interests: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class WalletLogin(BaseModel):
    walletAddress: str
    authType: str = 'wallet'
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    displayName: Optional[str] = None
    bio: Optional[str] = None
    redditHandle: Optional[str] = None
    xHandle: Optional[str] = None
    interests: Optional[List[str]] = None

class UserResponse(UserBase):
    id: int
    reputation_score: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
