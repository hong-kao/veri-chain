from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from .database import engine, Base, get_db
from .models import User
from .schemas import UserCreate, UserLogin, WalletLogin, UserResponse, Token
from .auth import get_password_hash, verify_password, create_access_token
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

@app.post("/auth/signup", response_model=UserResponse)
async def signup(user: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user exists
    result = await db.execute(select(User).where(User.email == user.email))
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = User(
        email=user.email,
        password_hash=hashed_password,
        full_name=user.full_name,
        reddit_handle=user.reddit_handle,
        x_handle=user.x_handle,
        auth_type="email"
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

@app.post("/auth/login", response_model=Token)
async def login(user_credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user_credentials.email))
    user = result.scalars().first()
    
    if not user or not verify_password(user_credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/wallet-login", response_model=UserResponse)
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
            reddit_handle=data.redditHandle,
            x_handle=data.xHandle,
            auth_type="wallet"
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Update existing user info if provided
        if data.email: user.email = data.email
        if data.name: user.full_name = data.name
        if data.redditHandle: user.reddit_handle = data.redditHandle
        if data.xHandle: user.x_handle = data.xHandle
        await db.commit()
        await db.refresh(user)
        
    return user

@app.get("/auth/google")
async def google_auth():
    return {"message": "Google OAuth redirect would happen here"}

@app.get("/auth/reddit")
async def reddit_auth():
    return {"message": "Reddit OAuth redirect would happen here"}
