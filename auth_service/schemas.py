from pydantic import BaseModel, EmailStr
from typing import Optional, List

class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    wallet_address: Optional[str] = None
    reddit_handle: Optional[str] = None
    x_handle: Optional[str] = None

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
    auth_type: str
    is_active: bool

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
