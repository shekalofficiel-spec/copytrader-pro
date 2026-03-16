import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Account, Stats, Trade, CopyEvent, PerformancePoint } from './types'

const API_URL_KEY = '@copytrader_api_url'
const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'

export async function getApiUrl(): Promise<string> {
  const stored = await AsyncStorage.getItem(API_URL_KEY)
  return stored || DEFAULT_API_URL
}

export async function setApiUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(API_URL_KEY, url)
}

async function createClient() {
  const baseURL = await getApiUrl()
  return axios.create({ baseURL: `${baseURL}/api`, timeout: 10000 })
}

export async function getStats(): Promise<Stats> {
  const client = await createClient()
  return client.get<Stats>('/stats').then(r => r.data)
}

export async function getAccounts(): Promise<Account[]> {
  const client = await createClient()
  return client.get<Account[]>('/accounts').then(r => r.data)
}

export async function toggleAccount(id: number): Promise<{ is_active: boolean }> {
  const client = await createClient()
  return client.post(`/accounts/${id}/toggle`).then(r => r.data)
}

export async function getActiveTrades(): Promise<Trade[]> {
  const client = await createClient()
  return client.get<Trade[]>('/trades/active').then(r => r.data)
}

export async function getTrades(params: Record<string, unknown> = {}) {
  const client = await createClient()
  return client.get('/trades', { params }).then(r => r.data)
}

export async function killSwitch() {
  const client = await createClient()
  return client.post('/trades/close-all').then(r => r.data)
}

export async function getCopyEvents(params: Record<string, unknown> = {}) {
  const client = await createClient()
  return client.get('/trades/copy-events', { params }).then(r => r.data)
}

export async function getPerformance(days = 30): Promise<PerformancePoint[]> {
  const client = await createClient()
  return client.get('/performance', { params: { days } }).then(r => r.data)
}

export async function getSettings() {
  const client = await createClient()
  return client.get('/settings').then(r => r.data)
}

export async function updateSettings(data: Record<string, unknown>) {
  const client = await createClient()
  return client.put('/settings', data).then(r => r.data)
}

export async function testTelegram() {
  const client = await createClient()
  return client.post('/settings/test-telegram').then(r => r.data)
}
