import { create } from 'zustand'

interface AppState {
  // Kill Switch state
  killSwitchPending: boolean
  setKillSwitchPending: (v: boolean) => void

  // Notification preferences
  notifyCopySuccess: boolean
  notifyCopyFailed: boolean
  notifyDrawdown: boolean
  setNotifyPref: (key: 'notifyCopySuccess' | 'notifyCopyFailed' | 'notifyDrawdown', value: boolean) => void

  // Drawdown alert threshold
  drawdownAlertThreshold: number
  setDrawdownAlertThreshold: (v: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  killSwitchPending: false,
  setKillSwitchPending: (v) => set({ killSwitchPending: v }),

  notifyCopySuccess: true,
  notifyCopyFailed: true,
  notifyDrawdown: true,
  setNotifyPref: (key, value) => set({ [key]: value }),

  drawdownAlertThreshold: 5.0,
  setDrawdownAlertThreshold: (v) => set({ drawdownAlertThreshold: v }),
}))
