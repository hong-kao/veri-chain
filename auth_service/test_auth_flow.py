import asyncio
import httpx
import random
import string

BASE_URL = "http://localhost:8001"

def generate_random_string(length=10):
    return ''.join(random.choices(string.ascii_lowercase, k=length))

async def test_flow():
    email = f"test_{generate_random_string()}@example.com"
    wallet = f"0x{generate_random_string(40)}"
    
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        print(f"Testing with email: {email}")
        
        # 1. Social Login
        print("\n1. Testing Social Login...")
        response = await client.post("/auth/social-login", json={
            "email": email,
            "full_name": "Test User",
            "auth_type": "google"
        })
        print(f"Status: {response.status_code}")
        if response.status_code != 200:
            print(response.text)
            return
        
        data = response.json()
        token = data["access_token"]
        user_id = data["user"]["id"]
        print(f"Got token: {token[:10]}...")
        print(f"User ID: {user_id}")
        
        # 2. Onboarding
        print("\n2. Testing Onboarding...")
        headers = {"Authorization": f"Bearer {token}"}
        onboarding_data = {
            "interests": ["tech", "misc"],
            "notif_type": "important_only",
            "full_name": "Updated Name"
        }
        response = await client.post("/auth/onboarding", json=onboarding_data, headers=headers)
        print(f"Status: {response.status_code}")
        if response.status_code != 200:
            print(response.text)
            return
            
        user = response.json()
        print(f"Updated User: {user}")
        assert user["interests"] == ["tech", "misc"]
        assert user["notif_type"] == "important_only"
        assert user["full_name"] == "Updated Name"
        
        # 3. Wallet Login (New User)
        print("\n3. Testing Wallet Login (New User)...")
        response = await client.post("/auth/wallet-login", json={
            "walletAddress": wallet
        })
        print(f"Status: {response.status_code}")
        if response.status_code != 200:
            print(response.text)
            return
            
        data = response.json()
        print(f"User created with wallet: {data['user']['wallet_address']}")
        
if __name__ == "__main__":
    asyncio.run(test_flow())
