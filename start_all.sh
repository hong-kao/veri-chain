#!/bin/bash

# Function to kill all background processes on exit
cleanup() {
    echo "Stopping all services..."
    kill $(jobs -p)
    exit
}

trap cleanup SIGINT SIGTERM

echo "Starting VeriChain Services..."

# Start Auth Service (Python)
echo "Starting Auth Service on port 8000..."
cd auth_service
# Check if venv exists, if not create it
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi
uvicorn main:app --reload --port 8000 &
AUTH_PID=$!
cd ..

# Start Backend (Node.js)
echo "Starting Backend on port 3000..."
cd backend
# Install dependencies if node_modules missing
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run dev &
BACKEND_PID=$!
cd ..

# Start Web3 (Hardhat)
echo "Starting Web3 Node on port 8545..."
cd web3
if [ ! -d "node_modules" ]; then
    npm install
fi
npx hardhat node &
WEB3_PID=$!
cd ..

# Start Frontend (Vite)
echo "Starting Frontend on port 5173..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run dev &
FRONTEND_PID=$!
cd ..

echo "All services started!"
echo "Auth Service: http://localhost:8000"
echo "Backend: http://localhost:3000"
echo "Web3 Node: http://localhost:8545"
echo "Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop all services."

wait
