#!/bin/bash

# Function to kill all background processes on exit
cleanup() {
    echo "Stopping all services..."
    kill $(jobs -p)
    exit
}

trap cleanup SIGINT SIGTERM

echo "Starting VeriChain Services..."
export HARDHAT_ANALYTICS_DISABLED=true
export GEMINI_API_KEY="placeholder"
export GOOGLE_API_KEY="placeholder"
export HH_NO_ANALYTICS=1
export DATABASE_URL="postgresql://abinav:vXK8tEXXJzGW7AJXKuzXMLClOsQFZqZi@dpg-d4kumnruibrs73fo5kg0-a.oregon-postgres.render.com/verichain"
export AUTH_DATABASE_URL="postgresql+asyncpg://abinav:vXK8tEXXJzGW7AJXKuzXMLClOsQFZqZi@dpg-d4kumnruibrs73fo5kg0-a.oregon-postgres.render.com/verichain"

# Start Web3 (Hardhat) - Starts first to allow initialization
echo "Starting Web3 Node on port 8545..."
cd web3
if [ ! -d "node_modules" ]; then
    npm install
fi
# Start Hardhat node and pipe 'y' to answer telemetry prompt
echo "y" | npx hardhat node &
WEB3_PID=$!
cd ..

# Start Auth Service (Python) - Starts in parallel with Web3 init
echo "Starting Auth Service on port 8000..."
cd auth_service
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi
DATABASE_URL=$AUTH_DATABASE_URL uvicorn main:app --reload --port 8000 &
AUTH_PID=$!
cd ..

echo "Waiting for Hardhat node to initialize..."
sleep 10

echo "Deploying contracts..."
cd web3
npx hardhat run scripts/deploy_all.ts --network localhost > ../deployment.log 2>&1
cat ../deployment.log
cd ..

# Extract addresses
CLAIM_REGISTRY=$(grep "ClaimRegistry:" deployment.log | awk '{print $2}')
VERIFICATION_MARKET=$(grep "VerificationMarket:" deployment.log | awk '{print $2}')

echo "ClaimRegistry: $CLAIM_REGISTRY"
echo "VerificationMarket: $VERIFICATION_MARKET"

export CLAIM_REGISTRY_ADDRESS=$CLAIM_REGISTRY
export STAKING_VOTING_ADDRESS=$VERIFICATION_MARKET
export RPC_URL="http://127.0.0.1:8545"
export PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Start Backend (Node.js) - Depends on Web3 addresses
echo "Starting Backend on port 3000..."
cd backend
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run build
cp -r src/generated dist/generated
npm start &
BACKEND_PID=$!
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
