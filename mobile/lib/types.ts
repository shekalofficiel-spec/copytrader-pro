export type BrokerType = 'MT4' | 'MT5' | 'CTRADER' | 'BINANCE'
export type AccountRole = 'MASTER' | 'SLAVE'
export type LotMode = 'MIRROR' | 'RATIO' | 'FIXED' | 'RISK_PERCENT'
export type TradeDirection = 'BUY' | 'SELL'
export type TradeStatus = 'OPEN' | 'CLOSED' | 'PARTIALLY_CLOSED' | 'CANCELLED'
export type CopyStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'RETRYING'

export interface Account {
  id: number
  name: string
  broker_type: BrokerType
  role: AccountRole
  is_active: boolean
  lot_ratio: number
  lot_mode: LotMode
  max_drawdown_pct: number
  max_trades: number
  allowed_instruments: string[]
  current_drawdown: number
  is_copy_paused: boolean
  balance?: number
  equity?: number
  margin_level?: number
  open_trades_count: number
  is_connected: boolean
  total_profit: number
}

export interface Trade {
  id: number
  account_id: number
  master_trade_id?: string
  symbol: string
  direction: TradeDirection
  lot_size: number
  open_price: number
  close_price?: number
  profit: number
  status: TradeStatus
  open_time: string
  close_time?: string
  copy_latency_ms?: number
}

export interface CopyEvent {
  id: number
  master_trade_id: string
  slave_account_id: number
  status: CopyStatus
  error_message?: string
  latency_ms?: number
  symbol: string
  direction: string
  master_lot: number
  slave_lot: number
  timestamp: string
}

export interface Stats {
  total_pnl: number
  today_pnl: number
  win_rate: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  trades_copied_today: number
  active_accounts: number
  master_accounts: number
  slave_accounts: number
  copy_success_rate: number
  avg_copy_latency_ms: number
}

export interface PerformancePoint {
  date: string
  pnl: number
  cumulative_pnl: number
  trades: number
}

export interface LiveEvent {
  event_type: string
  account_id?: number
  account_name?: string
  symbol?: string
  direction?: string
  lot_size?: number
  profit?: number
  message: string
  timestamp: string
  severity: 'info' | 'success' | 'warning' | 'error'
}
