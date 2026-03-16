import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, currency = 'USD'): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))
  return value < 0 ? `-${formatted}` : formatted
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function getPnlColor(value: number): string {
  if (value > 0) return 'text-green-profit'
  if (value < 0) return 'text-red-loss'
  return 'text-gray-400'
}

export function getBrokerColor(broker: string): string {
  const map: Record<string, string> = {
    MT5: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    MT4: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    CTRADER: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    BINANCE: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  }
  return map[broker] || 'bg-gray-500/20 text-gray-400'
}

export function getSeverityColor(severity: string): string {
  const map: Record<string, string> = {
    success: 'text-green-profit border-green-profit/30 bg-green-profit/10',
    error: 'text-red-loss border-red-loss/30 bg-red-loss/10',
    warning: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
    info: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
  }
  return map[severity] || map.info
}
