# VeriChain Authentication Service

The authentication microservice for VeriChain, handling user registration, login, JWT tokens, and OAuth integrations.

## ✅ Current Status

### Implemented Features
- ✅ **Email/Password Authentication**
  - User signup with bcrypt password hashing
  - User login with JWT token generation
  - JWT-based session management

- ✅ **Wallet-Based Authentication**
  - Connect with crypto wallet address
  - Automatic user creation/update on wallet login

- ✅ **PostgreSQL Database**
  - Async database operations with SQLAlchemy
  - User data persistence
  - Database migrations ready

### Placeholder Features (Not Yet Implemented)
- ⏳ **Google OAuth** - Endpoints exist but need implementation
- ⏳ **Reddit OAuth** - Endpoints exist but need implementation

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- PostgreSQL 17 (installed and running)
- PostgreSQL password: `Sh0310`

### Installation

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Setup Database** (First time only)
   ```bash
   python setup_db.py
   ```
   This creates the `verichain_auth` database and tables.

3. **Start the Service**
   ```bash
   python run.py
   ```
   The service will start on `http://localhost:8001`

4. **Test the Service**
   ```bash
   python test_service.py
   ```

## 📖 API Documentation

Once running, access the interactive API documentation:
- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

## 🔐 Available Endpoints

### Authentication
- `POST /auth/signup` - Register new user with email/password
- `POST /auth/login` - Login and receive JWT token
- `POST /auth/wallet-login` - Login with crypto wallet
- `GET /auth/google` - Google OAuth (placeholder)
- `GET /auth/reddit` - Reddit OAuth (placeholder)

## 🗄️ Database Schema

### User Table
```python
- id: Integer (Primary Key)
- email: String (Unique, Indexed)
- full_name: String
- password_hash: String (bcrypt)
- wallet_address: String (Unique, Indexed)
- reddit_handle: String
- x_handle: String
- auth_type: String ('email', 'wallet', 'google', 'reddit')
- created_at: DateTime
- is_active: Boolean
```

## 🔧 Configuration

### Database Connection
Update `database.py` or set environment variable:
```bash
DATABASE_URL=postgresql+asyncpg://postgres:Sh0310@localhost/verichain_auth
```

### JWT Secret Key
Update `auth.py` or set environment variable:
```bash
SECRET_KEY=your-secret-key-here
```

### Token Expiration
Default: 30 minutes. Change in `auth.py`:
```python
ACCESS_TOKEN_EXPIRE_MINUTES = 30
```

## 📁 Project Structure

```
auth_service/
├── __init__.py          # Package initialization
├── main.py              # FastAPI application and routes
├── auth.py              # JWT and password utilities
├── database.py          # Database connection and session
├── models.py            # SQLAlchemy models
├── schemas.py           # Pydantic schemas for validation
├── requirements.txt     # Python dependencies
├── run.py              # Service entry point
├── setup_db.py         # Database setup script
└── test_service.py     # API testing script
```

## 🔄 Integration with Frontend

The frontend (running on `http://localhost:5173`) can access this service via CORS-enabled endpoints.

Example login flow:
```javascript
const response = await fetch('http://localhost:8001/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const { access_token } = await response.json();
// Use token for authenticated requests
```

## 🛠️ Development

### Running in Development Mode
```bash
python run.py
```
Auto-reloads on code changes.

### Database Reset
To recreate the database from scratch:
```bash
# 1. Drop existing database (in PostgreSQL)
DROP DATABASE verichain_auth;

# 2. Run setup script again
python setup_db.py
```

## 🔐 Security Notes

⚠️ **Important**: The current password (`Sh0310`) is hardcoded for development only. 

For production:
1. Use environment variables for all sensitive data
2. Generate a strong random SECRET_KEY
3. Use proper password management
4. Enable SSL/TLS for database connections
5. Implement rate limiting
6. Add input validation and sanitization

## 🚧 Next Steps

To implement Google OAuth:
1. Register app in Google Cloud Console
2. Get OAuth client ID and secret
3. Implement OAuth flow in `main.py`
4. Update frontend to use Google Sign-In button

To implement Reddit OAuth:
1. Register app on Reddit
2. Get OAuth credentials
3. Implement OAuth flow similar to Google
4. Update frontend integration

## 📝 Notes

- Tables are auto-created on service startup
- Database uses async/await for all operations
- JWT tokens expire after 30 minutes
- Passwords are hashed with bcrypt
- CORS is enabled for localhost:5173 and localhost:3000
