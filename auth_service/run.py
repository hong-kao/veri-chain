"""
VeriChain Auth Service - Main Entry Point
Run this file to start the authentication service
"""
import sys
import os

# Add the parent directory to the path so we can import auth_service as a package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Now we can import and run
if __name__ == "__main__":
    import uvicorn
    from auth_service.main import app
    
    print("🚀 Starting VeriChain Auth Service on http://localhost:8001")
    print("📖 API Docs available at http://localhost:8001/docs")
    print("=" * 60)
    
    uvicorn.run(
        "auth_service.main:app",
        host="0.0.0.0",
        port=8001,
        reload=True
    )
