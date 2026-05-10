#!/usr/bin/env bash
set -euo pipefail

echo "verichain pre-flight check"
echo "=========================="

# check node.js (18+)
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version)
  MAJOR=$(echo "$NODE_VERSION" | sed 's/v//;s/\..*//')
  if [ "$MAJOR" -lt 18 ]; then
    echo "[error] node $NODE_VERSION detected -- version 18+ required"
    exit 1
  fi
  echo "[ok] node $NODE_VERSION"
else
  echo "[error] node not found -- install from https://nodejs.org"
  exit 1
fi

# check docker
if ! command -v docker &>/dev/null; then
  echo "[error] docker not found -- install from https://docs.docker.com/get-docker/"
  exit 1
fi
echo "[ok] docker $(docker --version | awk '{print $3}' | tr -d ',')"

# check docker compose (v2 plugin preferred, v1 standalone fallback)
if docker compose version &>/dev/null 2>&1; then
  echo "[ok] docker compose $(docker compose version --short)"
elif command -v docker-compose &>/dev/null; then
  echo "[ok] docker-compose $(docker-compose --version | awk '{print $3}' | tr -d ',')"
else
  echo "[error] docker compose not found"
  exit 1
fi

# check for local postgres -- warn if it could conflict on port 5432
if command -v psql &>/dev/null; then
  echo "[warn] local postgres detected: $(psql --version)"
  echo "       port 5432 must be free or the docker db service will fail to bind"
  echo "       macos:  brew services stop postgresql@16"
  echo "       linux:  sudo systemctl stop postgresql"
else
  echo "[ok] no local postgres detected"
fi

# check if port 5432 is already in use
if lsof -i:5432 &>/dev/null 2>&1; then
  echo "[warn] something is already listening on port 5432:"
  lsof -i:5432 | head -5
  echo "       stop it before running: docker compose up -d db"
else
  echo "[ok] port 5432 is free"
fi

echo ""
echo "pre-flight done. run: docker compose up -d db"
