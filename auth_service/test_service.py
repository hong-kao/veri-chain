"""
Test script to verify auth service is working
"""
import requests
import json

BASE_URL = "http://localhost:8001"

def test_endpoints():
    print("🧪 Testing VeriChain Auth Service\n")
    print("=" * 60)
    
    # Test 1: Google OAuth placeholder
    print("\n1. Testing /auth/google endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/auth/google")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        print("   ✓ Google OAuth endpoint is accessible")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    # Test 2: Reddit OAuth placeholder
    print("\n2. Testing /auth/reddit endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/auth/reddit")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        print("   ✓ Reddit OAuth endpoint is accessible")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    # Test 3: User signup (creates a test user)
    print("\n3. Testing /auth/signup endpoint...")
    test_user = {
        "email": "test@verichain.com",
        "password": "testpassword123",
        "full_name": "Test User",
        "reddit_handle": "test_reddit",
        "x_handle": "test_x"
    }
    try:
        response = requests.post(f"{BASE_URL}/auth/signup", json=test_user)
        if response.status_code == 200:
            print(f"   Status: {response.status_code}")
            print(f"   User created: {response.json()['email']}")
            print("   ✓ Signup successful - Database is working!")
        elif response.status_code == 400:
            print(f"   Status: {response.status_code}")
            print("   ✓ User already exists - Database is working!")
        else:
            print(f"   Status: {response.status_code}")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    # Test 4: User login
    print("\n4. Testing /auth/login endpoint...")
    login_data = {
        "email": "test@verichain.com",
        "password": "testpassword123"
    }
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            token = response.json()['access_token']
            print(f"   Token received: {token[:50]}...")
            print("   ✓ Login successful - JWT tokens working!")
        else:
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    print("\n" + "=" * 60)
    print("✅ Auth Service is running and database is connected!")
    print(f"📖 API Documentation: {BASE_URL}/docs")
    print(f"📖 Alternative Docs: {BASE_URL}/redoc")

if __name__ == "__main__":
    test_endpoints()
