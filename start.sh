#!/bin/bash
set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      CopyTrader Pro — Starting       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# ─── Check Python ────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo -e "${RED}❌ Python3 not found. Install from https://python.org${NC}"
  exit 1
fi

# ─── Check Node ──────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "${RED}❌ Node.js not found. Install from https://nodejs.org${NC}"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

# ─── Backend: install deps ────────────────────────────────────────
echo -e "${YELLOW}📦 Installing backend dependencies...${NC}"
cd "$BACKEND"

# Create venv if not exists
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
source venv/bin/activate

pip install -q --upgrade pip
pip install -q -r requirements-local.txt
pip install -q "python-jose[cryptography]" "passlib[bcrypt]" "bcrypt==4.2.1" "stripe" "email-validator" 2>/dev/null || true
echo -e "${GREEN}✅ Backend deps ready${NC}"

# ─── Frontend: install deps ───────────────────────────────────────
echo -e "${YELLOW}📦 Installing frontend dependencies...${NC}"
cd "$FRONTEND"
npm install --silent
echo -e "${GREEN}✅ Frontend deps ready${NC}"

# ─── Kill previous instances ──────────────────────────────────────
echo -e "${YELLOW}🔄 Stopping any existing instances...${NC}"
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 1

# ─── Start Backend ────────────────────────────────────────────────
echo -e "${YELLOW}🚀 Starting backend on http://localhost:8000...${NC}"
cd "$BACKEND"
source venv/bin/activate
uvicorn main:app --reload --port 8000 --host 0.0.0.0 > /tmp/copytrader-backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
echo -n "   Waiting for backend"
for i in {1..20}; do
  sleep 1
  echo -n "."
  if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo ""
    echo -e "${GREEN}✅ Backend ready${NC}"
    break
  fi
  if [ $i -eq 20 ]; then
    echo ""
    echo -e "${RED}❌ Backend failed to start. Check logs:${NC}"
    tail -20 /tmp/copytrader-backend.log
    exit 1
  fi
done

# ─── Start Frontend ───────────────────────────────────────────────
echo -e "${YELLOW}🚀 Starting frontend on http://localhost:5173...${NC}"
cd "$FRONTEND"
npm run dev > /tmp/copytrader-frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 3
echo -e "${GREEN}✅ Frontend ready${NC}"

# ─── Open browser ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ CopyTrader Pro is running!           ║${NC}"
echo -e "${GREEN}║                                          ║${NC}"
echo -e "${GREEN}║  🌐 Web App  → http://localhost:5173     ║${NC}"
echo -e "${GREEN}║  📡 API Docs → http://localhost:8000/docs║${NC}"
echo -e "${GREEN}║                                          ║${NC}"
echo -e "${GREEN}║  Press Ctrl+C to stop all services       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Open browser on Mac
if [[ "$OSTYPE" == "darwin"* ]]; then
  sleep 1
  open http://localhost:5173
fi

# ─── Wait and handle Ctrl+C ──────────────────────────────────────
cleanup() {
  echo ""
  echo -e "${YELLOW}🛑 Stopping all services...${NC}"
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  pkill -f "uvicorn main:app" 2>/dev/null || true
  pkill -f "vite" 2>/dev/null || true
  echo -e "${GREEN}Done. Goodbye!${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

# Keep running — show logs
echo -e "${BLUE}Backend log:${NC} /tmp/copytrader-backend.log"
echo -e "${BLUE}Frontend log:${NC} /tmp/copytrader-frontend.log"
echo ""
tail -f /tmp/copytrader-backend.log &
wait
