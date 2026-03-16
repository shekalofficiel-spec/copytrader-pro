import axios from 'axios'
import type { Account, Stats, PerformancePoint, Trade, CopyEvent, AppSettings } from '../types'

const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ─── JWT Interceptors ─────────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { email: string; password: string; full_name: string }) =>
    api.post('/auth/register', data).then(r => r.data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
}

// ─── Billing ──────────────────────────────────────────────────────────────────
export const billingApi = {
  subscription: () => api.get('/billing/subscription').then(r => r.data),
  checkout: (plan: string) => api.post(`/billing/checkout/${plan}`).then(r => r.data),
}

// ─── Accounts ─────────────────────────────────────────────────────────────────
export const accountsApi = {
  list: () => api.get<Account[]>('/accounts').then(r => r.data),
  get: (id: number) => api.get<Account>(`/accounts/${id}`).then(r => r.data),
  create: (data: Record<string, unknown>) => api.post<Account>('/accounts', data).then(r => r.data),
  update: (id: number, data: Record<string, unknown>) => api.put<Account>(`/accounts/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/accounts/${id}`),
  testConnection: (id: number) => api.post(`/accounts/${id}/test-connection`).then(r => r.data),
  toggle: (id: number) => api.post(`/accounts/${id}/toggle`).then(r => r.data),
}

// ─── Stats & Dashboard ────────────────────────────────────────────────────────
export const dashboardApi = {
  stats: () => api.get<Stats>('/stats').then(r => r.data),
  performance: (days = 30, accountId?: number) =>
    api.get<PerformancePoint[]>('/performance', { params: { days, account_id: accountId } }).then(r => r.data),
}

// ─── Trades ───────────────────────────────────────────────────────────────────
export const tradesApi = {
  list: (params: Record<string, unknown> = {}) =>
    api.get<{ total: number; trades: Trade[]; page: number }>('/trades', { params }).then(r => r.data),
  active: () => api.get<Trade[]>('/trades/active').then(r => r.data),
  killSwitch: () => api.post('/trades/close-all').then(r => r.data),
  copyEvents: (params: Record<string, unknown> = {}) =>
    api.get<{ total: number; events: CopyEvent[] }>('/trades/copy-events', { params }).then(r => r.data),
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => api.get<AppSettings>('/settings').then(r => r.data),
  update: (data: Record<string, unknown>) => api.put('/settings', data).then(r => r.data),
  testTelegram: () => api.post('/settings/test-telegram').then(r => r.data),
  testEmail: () => api.post('/settings/test-email').then(r => r.data),
}

export default api
