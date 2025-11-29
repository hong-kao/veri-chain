from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import engine, Base, get_db
from models import User
from schemas import UserCreate, UserLogin, WalletLogin, UserResponse, Token, AuthResponse, SocialLogin, UserOnboarding
from auth import create_access_token, get_current_user
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(lifespan=lifespan)

# CORS configuration
origins = [
    "http://localhost:5173", # Frontend
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# @app.post("/auth/signup") - Removed as password auth is not supported
# @app.post("/auth/login") - Removed as password auth is not supported

@app.post("/auth/wallet-login", response_model=AuthResponse)
async def wallet_login(data: WalletLogin, db: AsyncSession = Depends(get_db)):
    # Check if user exists by wallet address
    result = await db.execute(select(User).where(User.wallet_address == data.walletAddress))
    user = result.scalars().first()
    
    if not user:
        # Create new user from wallet data
        user = User(
            wallet_address=data.walletAddress,
            email=data.email,
            full_name=data.name or data.displayName,
            reddit_profile=data.redditHandle,
            x_profile=data.xHandle,
            # auth_type="wallet" # Not in DB
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Update existing user info if provided
        if data.email: user.email = data.email
        if data.name: user.full_name = data.name
        if data.redditHandle: user.reddit_profile = data.redditHandle
        if data.xHandle: user.x_profile = data.xHandle
        await db.commit()
        await db.refresh(user)
        
    access_token = create_access_token(data={"sub": user.email if user.email else user.wallet_address})
    return {"access_token": access_token, "token_type": "bearer", "user": user}

@app.post("/auth/social-login", response_model=AuthResponse)
async def social_login(data: SocialLogin, db: AsyncSession = Depends(get_db)):
    # Check if user exists by email
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalars().first()
    
    if not user:
        # Create new user
        user = User(
            email=data.email,
            full_name=data.full_name,
            # auth_type=data.auth_type # Not in DB
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer", "user": user}

@app.post("/auth/onboarding", response_model=UserResponse)
async def onboarding(data: UserOnboarding, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Update user with onboarding data
    current_user.interests = data.interests
    current_user.notif_type = data.notif_type
    
    if data.full_name:
        current_user.full_name = data.full_name
    if data.email and not current_user.email:
        current_user.email = data.email
        
    await db.commit()
    await db.refresh(current_user)
    return current_user

@app.get("/auth/google")
async def google_auth():
    return {"message": "Google OAuth redirect would happen here"}

@app.get("/auth/reddit")
async def reddit_auth():
    return {"message": "Reddit OAuth redirect would happen here"}
