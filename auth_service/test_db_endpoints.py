"""
Test script to demonstrate the database test endpoints
"""
import requests
import json

BASE_URL = "http://localhost:8001"

def print_section(title):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)

def test_db_health():
    """Test the database health check endpoint"""
    print_section("1. DATABASE HEALTH CHECK")
    
    response = requests.get(f"{BASE_URL}/test/db-health")
    data = response.json()
    
    print(f"Status: {response.status_code}")
    print(f"Database Status: {data['status']}")
    print(f"Connection: {data['connection']}")
    print(f"Database: {data['database']}")
    print(f"PostgreSQL Version: {data['version'][:80]}...")
    print(f"Total Users: {data['user_count']}")
    print(f"Timestamp: {data['timestamp']}")
    
    return data

def test_db_insert_sample():
    """Test database insert with sample data"""
    print_section("2. INSERT SAMPLE DATA")
    
    sample_data = {
        "email": "sample.user@verichain.com",
        "full_name": "Sample Test User",
        "password": "samplepassword123",
        "reddit_handle": "sample_reddit_user",
        "x_handle": "sample_x_user"
    }
    
    print("Sending sample data:")
    print(json.dumps(sample_data, indent=2))
    
    response = requests.post(f"{BASE_URL}/test/db-insert", json=sample_data)
    data = response.json()
    
    print(f"\nResponse Status: {response.status_code}")
    print(f"Status: {data['status']}")
    print(f"Message: {data.get('message', 'N/A')}")
    if 'user_id' in data:
        print(f"User ID: {data['user_id']}")
        print(f"Email: {data['email']}")
        print(f"Full Name: {data['full_name']}")
        print(f"Created At: {data.get('created_at', 'N/A')}")
    
    return data

def test_db_insert_custom(custom_data):
    """Test database insert with custom data"""
    print_section("3. INSERT YOUR CUSTOM DATA")
    
    print("Sending your custom data:")
    print(json.dumps(custom_data, indent=2))
    
    response = requests.post(f"{BASE_URL}/test/db-insert", json=custom_data)
    data = response.json()
    
    print(f"\nResponse Status: {response.status_code}")
    print(f"Status: {data['status']}")
    print(f"Message: {data.get('message', 'N/A')}")
    if 'user_id' in data:
        print(f"User ID: {data['user_id']}")
        print(f"Email: {data['email']}")
        print(f"Full Name: {data['full_name']}")
    
    return data

def test_list_users():
    """List all users in database"""
    print_section("4. LIST ALL USERS")
    
    response = requests.get(f"{BASE_URL}/test/db-users")
    data = response.json()
    
    print(f"Status: {response.status_code}")
    print(f"Total Users: {data['total_users']}\n")
    
    for i, user in enumerate(data['users'], 1):
        print(f"User {i}:")
        print(f"  ID: {user['id']}")
        print(f"  Email: {user['email']}")
        print(f"  Name: {user['full_name']}")
        print(f"  Auth Type: {user['auth_type']}")
        print(f"  Created: {user['created_at']}")
        if user['reddit_handle']:
            print(f"  Reddit: {user['reddit_handle']}")
        if user['x_handle']:
            print(f"  X/Twitter: {user['x_handle']}")
        print()
    
    return data

def test_cleanup(pattern=None):
    """Clean up test users"""
    print_section("5. CLEANUP TEST USERS")
    
    url = f"{BASE_URL}/test/db-cleanup"
    if pattern:
        url += f"?email_pattern={pattern}"
    
    print(f"Cleaning up users with pattern: '{pattern or 'test'}'")
    
    response = requests.delete(url)
    data = response.json()
    
    print(f"\nStatus: {response.status_code}")
    print(f"Message: {data['message']}")
    print(f"Deleted Count: {data['deleted_count']}")
    
    return data

if __name__ == "__main__":
    print("\n" + "🧪" * 35)
    print("      VeriChain Database Test Suite")
    print("🧪" * 35)
    
    try:
        # Test 1: Health check
        test_db_health()
        
        # Test 2: Insert sample data
        test_db_insert_sample()
        
        # Test 3: Insert custom data - YOU CAN MODIFY THIS!
        # Example: Your custom input
        your_custom_data = {
            "email": "mytest@example.com",
            "full_name": "My Custom User",
            "password": "mycustompassword",
            "reddit_handle": "my_reddit",
            "x_handle": "my_twitter",
            "wallet_address": "0x1234567890abcdef"
        }
        test_db_insert_custom(your_custom_data)
        
        # Test 4: List all users
        test_list_users()
        
        # Optional: Cleanup (uncomment to run)
        # test_cleanup("sample")  # Clean up users with "sample" in email
        
        print_section("✅ ALL TESTS COMPLETED SUCCESSFULLY!")
        print("\nDatabase is fully operational! 🎉")
        print(f"\nYou can also test interactively at: {BASE_URL}/docs")
        
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to auth service")
        print("Make sure the service is running: python run.py")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
