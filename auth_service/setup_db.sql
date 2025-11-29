-- Create the verichain_auth database
CREATE DATABASE verichain_auth;

-- Connect to the database
\c verichain_auth;

-- Grant privileges (optional, if using specific user)
GRANT ALL PRIVILEGES ON DATABASE verichain_auth TO postgres;
