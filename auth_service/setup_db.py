"""
Database setup script for VeriChain Auth Service
Run this to create the PostgreSQL database
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import sys

async def create_database():
    # Connect to default 'postgres' database to create our database
    admin_url = "postgresql+asyncpg://postgres:Sh0310@localhost/postgres"
    
    print("🔧 Connecting to PostgreSQL...")
    try:
        engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        
        async with engine.connect() as conn:
            # Check if database exists
            result = await conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname='verichain_auth'")
            )
            exists = result.scalar()
            
            if exists:
                print("✓ Database 'verichain_auth' already exists!")
            else:
                print("Creating database 'verichain_auth'...")
                await conn.execute(text("CREATE DATABASE verichain_auth"))
                print("✓ Database 'verichain_auth' created successfully!")
        
        await engine.dispose()
        
        # Now test connection to the new database
        print("\n🔧 Testing connection to verichain_auth...")
        test_url = "postgresql+asyncpg://postgres:Sh0310@localhost/verichain_auth"
        test_engine = create_async_engine(test_url)
        
        async with test_engine.connect() as conn:
            result = await conn.execute(text("SELECT version()"))
            version = result.scalar()
            print(f"✓ Connected successfully!")
            print(f"PostgreSQL version: {version[:50]}...")
        
        await test_engine.dispose()
        
        print("\n" + "="*60)
        print("✅ Database setup complete!")
        print("="*60)
        print("\nYou can now start the auth service with:")
        print("  uvicorn main:app --reload --port 8001")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nPlease check:")
        print("  1. PostgreSQL is running")
        print("  2. Username is 'postgres'")
        print("  3. Password is 'postgres' (or update in database.py)")
        print("  4. PostgreSQL is listening on localhost:5432")
        return False

if __name__ == "__main__":
    success = asyncio.run(create_database())
    sys.exit(0 if success else 1)
