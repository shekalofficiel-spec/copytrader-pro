# CopyTrader Pro

Professional copy trading system supporting MT4, MT5, cTrader, and Binance (Spot & Futures).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Master Account (MT5/MT4/cTrader/Binance)                       │
│  Polling every 100ms → Detects trade events                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ TradeEvent
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Copy Engine + Risk Manager                                      │
│  • Check instruments, drawdown, margin, max trades               │
│  • Calculate lot (Mirror/Ratio/Fixed/Risk%)                      │
│  • Execute in parallel on all slave accounts                     │
│  • Retry 3x with exponential backoff                             │
└────────────────────────────┬────────────────────────────────────┘
                             │ OrderRequest
                             ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ MT5 Slave│ │ MT4 Slave│ │cTrader   │ │ Binance  │
│ (0.5x)   │ │ (EA Brdg)│ │ (FTMO)   │ │ Futures  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

## Quick Start

### 1. Setup

```bash
git clone <repo>
cd copytrader-pro
cp .env.example .env
# Edit .env with your values
```

### 2. Launch with Docker

```bash
docker-compose up -d

# Run database migrations
docker-compose exec backend alembic upgrade head
```

### 3. Access

| Service | URL |
|---------|-----|
| Web Dashboard | http://localhost |
| API Docs | http://localhost/docs |
| API Redoc | http://localhost/redoc |

---

## Stack

### Backend
- **FastAPI** (async) + **Python 3.11**
- **PostgreSQL 16** + SQLAlchemy 2.0 (async)
- **Redis 7** — pub/sub, caching
- **Celery** — async notifications, daily reports
- **Alembic** — database migrations

### Frontend
- **React 18** + TypeScript + Vite
- **TailwindCSS** + custom dark theme
- **Recharts** — performance charts
- **TanStack Query** — server state
- **WebSocket** — real-time feed

### Mobile (Expo)
- **React Native** + Expo SDK 51
- **Expo Router** — file-based navigation
- **NativeWind** — TailwindCSS for RN
- **Push Notifications** via expo-notifications

---

## Mobile App

### Setup

```bash
cd mobile
npm install
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your backend IP
```

### Run

```bash
npx expo start          # QR code — scan with Expo Go
npx expo run:android    # Build for Android
npx expo run:ios        # Build for iOS (Mac required)
```

### Features
- Real-time dashboard with P&L, active trades, live event feed
- Kill Switch button (always visible, 3x retry on network issues)
- Account list with swipe toggle, drawdown indicators
- Trades history with filters
- Push notifications for copy success/failure, drawdown alerts
- Configurable backend URL for self-hosted servers

---

## Broker Connectors

| Broker | Method | Notes |
|--------|--------|-------|
| MT5 | Official Python API | Windows only for live trading |
| MT4 | TCP Bridge EA | Install `CopyTradeBridge.mq4` in MT4 |
| cTrader | Open API (protobuf) | Supports FTMO cTrader variant |
| Binance | REST + WebSocket | Spot & USDT-M Futures |

### MT4 Bridge Setup
1. Copy `mt4_bridge/CopyTradeBridge.mq4` to your MT4 `MQL4/Experts/` folder
2. Compile and attach to any chart
3. Set `ServerPort = 5555` (default)
4. In backend credentials: `{"host": "127.0.0.1", "port": 5555}`

---

## Copy Modes

| Mode | Description |
|------|-------------|
| `MIRROR` | Exact lot from master |
| `RATIO` | `master_lot × ratio` |
| `FIXED` | Fixed lot per order |
| `RISK_PERCENT` | Calculated from % of slave capital |

---

## Risk Manager Rules

- Max daily drawdown % → auto-pause copy for that account
- Min margin level % → block new orders
- Max simultaneous trades
- Max lot size cap
- Prop firm mode: no weekend trading, no news trading
- **Kill Switch**: close ALL positions on ALL slaves instantly

---

## Notifications

### Telegram
```
✅ Trade Copied
Account: `Slave_1`
Symbol: `EURUSD` BUY
Lot: `0.5` (latency: 85ms)
```

### Daily Email Report
- Sent at configurable hour (UTC)
- HTML template with P&L, win rate, top trades

---

## Environment Variables

See `.env.example` for all configuration options.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `SECRET_KEY` | JWT / session secret (32+ chars) |
| `ENCRYPTION_KEY` | AES-256 key for credential encryption |
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_CHAT_ID` | Your chat or group ID |
| `SMTP_*` | Email settings for daily reports |
| `COPY_POLL_INTERVAL_MS` | Master polling interval (default: 100ms) |
| `COPY_RETRY_COUNT` | Order retry attempts (default: 3) |

---

## API Reference

### Accounts
- `GET /api/accounts` — list all
- `POST /api/accounts` — create
- `PUT /api/accounts/{id}` — update
- `DELETE /api/accounts/{id}` — delete
- `POST /api/accounts/{id}/test-connection` — test broker
- `POST /api/accounts/{id}/toggle` — enable/disable

### Trades
- `GET /api/trades` — history (pagination + filters)
- `GET /api/trades/active` — open positions
- `POST /api/trades/close-all` — **Kill Switch**
- `GET /api/trades/copy-events` — copy log

### Dashboard
- `GET /api/stats` — KPIs
- `GET /api/performance?days=30` — performance curve
- `WebSocket /ws/live` — real-time event stream

### Settings
- `GET/PUT /api/settings` — configuration
- `POST /api/settings/test-telegram` — test notification
- `POST /api/settings/test-email` — test email
