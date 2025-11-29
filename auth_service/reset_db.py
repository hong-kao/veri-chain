"""
Reset database script
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import sys

async def reset_database():
    # Connect to default 'postgres' database
    admin_url = "postgresql+asyncpg://postgres:Sh0310@localhost/postgres"
    
    print("🔧 Connecting to PostgreSQL...")
    try:
        engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        
        async with engine.connect() as conn:
            # Terminate existing connections
            await conn.execute(text("""
                SELECT pg_terminate_backend(pid) 
                FROM pg_stat_activity 
                WHERE datname = 'verichain_auth' 
                AND pid <> pg_backend_pid()
            """))
            
            # Drop database
            print("Dropping database 'verichain_auth'...")
            await conn.execute(text("DROP DATABASE IF EXISTS verichain_auth"))
            
            # Create database
            print("Creating database 'verichain_auth'...")
            await conn.execute(text("CREATE DATABASE verichain_auth"))
            print("✓ Database reset successfully!")
        
        await engine.dispose()
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return False

if __name__ == "__main__":
    asyncio.run(reset_database())
