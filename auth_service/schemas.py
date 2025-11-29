from pydantic import BaseModel, EmailStr
from typing import Optional, List

class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    wallet_address: Optional[str] = None
    reddit_profile: Optional[str] = None
    x_profile: Optional[str] = None
    farcaster_profile: Optional[str] = None

class UserCreate(UserBase):
    pass # No password

class UserLogin(BaseModel):
    email: EmailStr
    # password: str # Removed

class WalletLogin(BaseModel):
    walletAddress: str
    # authType: str = 'wallet' # Not stored in DB
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    displayName: Optional[str] = None
    bio: Optional[str] = None
    redditHandle: Optional[str] = None # Input might still use handle, map to profile
    xHandle: Optional[str] = None
    interests: Optional[List[str]] = None

class UserResponse(UserBase):
    id: int
    # auth_type: str # Removed
    # is_active: bool # Removed
    interests: Optional[List[str]] = None
    notif_type: Optional[str] = None
    reputation_score: int = 0

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class UserOnboarding(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    interests: List[str]
    notif_type: str

class SocialLogin(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    # auth_type: str = 'google' # Not stored
