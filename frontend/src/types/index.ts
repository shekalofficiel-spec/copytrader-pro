export type BrokerType = 'MT4' | 'MT5' | 'METAAPI' | 'CTRADER' | 'BINANCE'
export type AccountRole = 'MASTER' | 'SLAVE'
export type LotMode = 'MIRROR' | 'RATIO' | 'FIXED' | 'RISK_PERCENT'
export type TradeDirection = 'BUY' | 'SELL'
export type TradeStatus = 'OPEN' | 'CLOSED' | 'PARTIALLY_CLOSED' | 'CANCELLED'
export type CopyStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'RETRYING'
export type EventSeverity = 'info' | 'success' | 'warning' | 'error'

export interface Account {
  id: number
  name: string
  broker_type: BrokerType
  role: AccountRole
  is_active: boolean
  lot_ratio: number
  lot_mode: LotMode
  fixed_lot_size: number
  risk_percent: number
  max_drawdown_pct: number
  max_trades: number
  min_margin_level: number
  max_lot_size: number
  prop_firm_mode: boolean
  prop_firm_rules?: string
  profit_target_pct?: number
  daily_drawdown_pct?: number
  total_drawdown_pct?: number
  no_trade_weekend: boolean
  no_trade_news: boolean
  allowed_instruments: string[]
  current_drawdown: number
  is_copy_paused: boolean
  created_at: string
  updated_at: string
  // Runtime
  balance?: number
  equity?: number
  margin_level?: number
  open_trades_count: number
  is_connected: boolean
  is_verified: boolean
  total_profit: number
}

export interface Trade {
  id: number
  account_id: number
  master_trade_id?: string
  broker_ticket?: string
  symbol: string
  direction: TradeDirection
  lot_size: number
  open_price: number
  close_price?: number
  stop_loss?: number
  take_profit?: number
  profit: number
  swap: number
  commission: number
  status: TradeStatus
  open_time: string
  close_time?: string
  copy_latency_ms?: number
  created_at: string
}

export interface CopyEvent {
  id: number
  master_trade_id: string
  slave_account_id: number
  slave_trade_id?: number
  status: CopyStatus
  error_message?: string
  latency_ms?: number
  retry_count: number
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
  severity: EventSeverity
}

export type SubscriptionTier = 'FREE' | 'STARTER' | 'PRO'

export interface AuthUser {
  id: number
  email: string
  full_name: string
  subscription_tier: SubscriptionTier
  is_active: boolean
  created_at: string
  onboarding_completed: boolean
  totp_enabled: boolean
}

export interface UserSession {
  id: string
  device_type: string
  ip_address: string
  user_agent: string
  created_at: string
  last_active: string
}

export interface SubscriptionInfo {
  tier: SubscriptionTier
  max_slaves: number
  stripe_customer_id?: string
  stripe_subscription_id?: string
  subscription_expires_at?: string
}

export interface AppSettings {
  telegram_bot_token?: string
  telegram_chat_id?: string
  telegram_configured: boolean
  smtp_host: string
  smtp_port: number
  smtp_user?: string
  smtp_configured: boolean
  daily_report_hour: number
  copy_poll_interval_ms: number
  copy_retry_count: number
  copy_retry_delay_ms: number
}
