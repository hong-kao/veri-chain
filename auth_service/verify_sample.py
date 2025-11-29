import requests
import json
import time

BASE_URL = "http://localhost:8001"
EMAIL = "Shirish@gmail.com"
PASSWORD = "PASSWORD"
WALLET = "0x1234567890abcdef1234567890abcdef12345678"

def run_test():
    print(f"Testing with user: {EMAIL}")
    
    # 1. Signup
    print("\n1. SIGNUP Request...")
    payload = {
        "email": EMAIL,
        "password": PASSWORD,
        "full_name": "Shirish",
        "wallet_address": WALLET,
        "notif_type": "standard",
        "interests": "tech"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/auth/signup", json=payload)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            print("Response:")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Request failed: {e}")

    # 2. Login
    print("\n2. LOGIN Request...")
    login_payload = {
        "email": EMAIL,
        "password": PASSWORD
    }
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json=login_payload)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            print("Response:")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    # Wait for server to be ready
    time.sleep(2)
    run_test()
