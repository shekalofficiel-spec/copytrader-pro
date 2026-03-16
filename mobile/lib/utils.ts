export function formatCurrency(value: number): string {
  const abs = Math.abs(value)
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(abs)
  return value < 0 ? `-${formatted}` : formatted
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getPnlColor(value: number): string {
  if (value > 0) return '#00d084'
  if (value < 0) return '#ff4d6d'
  return '#9ca3af'
}

export function getBrokerBadgeColor(broker: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    MT5: { bg: '#1e3a5f', text: '#60a5fa' },
    MT4: { bg: '#3b1f5e', text: '#c084fc' },
    CTRADER: { bg: '#5e3b1f', text: '#fb923c' },
    BINANCE: { bg: '#5e4a1f', text: '#fbbf24' },
  }
  return map[broker] || { bg: '#374151', text: '#9ca3af' }
}

export function getSeverityColor(severity: string): string {
  const map: Record<string, string> = {
    success: '#00d084',
    error: '#ff4d6d',
    warning: '#fbbf24',
    info: '#60a5fa',
  }
  return map[severity] || map.info
}
