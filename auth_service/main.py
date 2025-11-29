from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import datetime
from .database import engine, Base, get_db
from .models import User, NotifType
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

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    print(f"🔥 UNHANDLED EXCEPTION: {str(exc)}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )

from fastapi.responses import JSONResponse

@app.post("/auth/signup", response_model=UserResponse)
async def signup(user: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user exists
    result = await db.execute(select(User).where(
        (User.wallet_address == user.wallet_address) | 
        (User.email == user.email)
    ))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="User with this wallet or email already exists")
    
    hashed_password = get_password_hash(user.password)
    db_user = User(
        wallet_address=user.wallet_address,
        email=user.email,
        full_name=user.full_name,
        reddit_profile=user.reddit_profile,
        x_profile=user.x_profile,
        farcaster_profile=user.farcaster_profile,
        notif_type=NotifType(user.notif_type) if user.notif_type else NotifType.standard,
        interests=user.interests,
        password_hash=hashed_password
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
            reddit_profile=data.redditHandle,
            x_profile=data.xHandle
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
        
    return user

@app.get("/auth/google")
async def google_auth():
    return {"message": "Google OAuth redirect would happen here"}

@app.get("/auth/reddit")
async def reddit_auth():
    return {"message": "Reddit OAuth redirect would happen here"}

# ==================== TEST ENDPOINTS ====================
# These endpoints are for testing database connectivity and operations

@app.get("/test/db-health")
async def test_database_health(db: AsyncSession = Depends(get_db)):
    """
    Test endpoint to verify database connection and health
    Returns database status, connection info, and user count
    """
    try:
        from sqlalchemy import text
        
        # Test 1: Basic connection test
        result = await db.execute(text("SELECT 1"))
        connection_ok = result.scalar() == 1
        
        # Test 2: Get PostgreSQL version
        version_result = await db.execute(text("SELECT version()"))
        db_version = version_result.scalar()
        
        # Test 3: Count users using raw SQL
        count_result = await db.execute(text("SELECT COUNT(*) FROM users"))
        user_count = count_result.scalar()
        
        return {
            "status": "healthy",
            "database": "verichain_auth",
            "connection": "ok" if connection_ok else "failed",
            "version": db_version.split(",")[0] if db_version else "unknown",
            "user_count": user_count,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database health check failed: {str(e)}"
        )

# Temporarily disabled - endpoint has syntax errors
# @app.post("/test/db-insert")
# async def test_database_insert(data: dict, db: AsyncSession = Depends(get_db)):
#     pass

@app.get("/test/db-users")
async def test_list_users(db: AsyncSession = Depends(get_db)):
    """
    Test endpoint to list all users in the database
    Returns sanitized user information (no passwords)
    """
    try:
        result = await db.execute(select(User))
        users = result.scalars().all()
        
        user_list = [
            {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "wallet_address": user.wallet_address,
                "reddit_profile": user.reddit_profile,
                "x_profile": user.x_profile,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "notif_type": user.notif_type,
                "interests": user.interests
            }
            for user in users
        ]
        
        return {
            "status": "success",
            "total_users": len(user_list),
            "users": user_list
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list users: {str(e)}"
        )

@app.delete("/test/db-cleanup")
async def test_cleanup_users(email_pattern: str = None, db: AsyncSession = Depends(get_db)):
    """
    Test endpoint to clean up test users
    If email_pattern provided, deletes users matching that pattern
    Otherwise, deletes all users with email containing 'test'
    
    Example: /test/db-cleanup?email_pattern=sample
    """
    try:
        from sqlalchemy import delete
        
        if email_pattern:
            query = delete(User).where(User.email.contains(email_pattern))
        else:
            query = delete(User).where(User.email.contains("test"))
        
        result = await db.execute(query)
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Deleted {result.rowcount} test users",
            "deleted_count": result.rowcount,
            "pattern_used": email_pattern or "test"
        }
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Cleanup failed: {str(e)}"
        )
