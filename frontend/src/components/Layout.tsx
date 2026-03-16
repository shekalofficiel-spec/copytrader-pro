import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, TrendingUp, ScrollText, Settings, Zap, Wifi, WifiOff, CreditCard, LogOut, Menu } from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useState } from 'react'
import { tradesApi } from '../lib/api'
import { cn } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/accounts', icon: Users, label: 'Accounts' },
  { path: '/trades', icon: TrendingUp, label: 'Trades' },
  { path: '/logs', icon: ScrollText, label: 'Logs' },
  { path: '/settings', icon: Settings, label: 'Settings' },
  { path: '/billing', icon: CreditCard, label: 'Billing' },
]

const TIER_BADGE: Record<string, string> = {
  FREE: 'bg-gray-700 text-gray-300',
  STARTER: 'bg-blue-900 text-blue-300',
  PRO: 'bg-yellow-900/50 text-yellow-400',
}

export default function Layout() {
  const { isConnected } = useWebSocket()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [killConfirm, setKillConfirm] = useState(false)
  const [killing, setKilling] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleKillSwitch = async () => {
    if (!killConfirm) {
      setKillConfirm(true)
      setTimeout(() => setKillConfirm(false), 3000)
      return
    }
    setKilling(true)
    try {
      await tradesApi.killSwitch()
    } finally {
      setKilling(false)
      setKillConfirm(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-5 border-b border-dark-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gold/10 border border-gold/30 rounded flex items-center justify-center">
            <Zap className="w-4 h-4 text-gold" />
          </div>
          <div>
            <div className="font-bold text-white text-sm leading-tight">CopyTrader</div>
            <div className="text-gold text-xs font-semibold">Pro</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-gold/10 text-gold border border-gold/20'
                  : 'text-gray-400 hover:text-white hover:bg-dark-700'
              )
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-4 border-t border-dark-700 space-y-3">
        <button
          onClick={handleKillSwitch}
          disabled={killing}
          className={cn(
            'w-full py-2.5 px-4 rounded-lg text-sm font-bold transition-all border',
            killConfirm
              ? 'bg-red-loss border-red-loss text-white animate-pulse'
              : 'bg-red-loss/10 border-red-loss/30 text-red-loss hover:bg-red-loss/20'
          )}
        >
          {killing ? '⏳ Closing...' : killConfirm ? '⚠️ CONFIRM?' : '🛑 Kill Switch'}
        </button>

        <div className="flex items-center gap-2 text-xs">
          {isConnected ? (
            <><Wifi className="w-3 h-3 text-green-profit" /><span className="text-green-profit">Live</span></>
          ) : (
            <><WifiOff className="w-3 h-3 text-red-loss" /><span className="text-red-loss">Reconnecting...</span></>
          )}
        </div>

        {user && (
          <div className="pt-1 border-t border-dark-700">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
                <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', TIER_BADGE[user.subscription_tier] || TIER_BADGE.FREE)}>
                  {user.subscription_tier}
                </span>
              </div>
              <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 transition-colors ml-2" title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-dark-950 text-white overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-60 bg-dark-900 border-r border-dark-700 flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* ── Mobile overlay sidebar ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-dark-900 border-r border-dark-700 flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-dark-900 border-b border-dark-700">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-gold" />
            <span className="font-bold text-white text-sm">CopyTrader <span className="text-gold">Pro</span></span>
          </div>
          <div className="flex items-center gap-1">
            {isConnected
              ? <Wifi className="w-4 h-4 text-green-profit" />
              : <WifiOff className="w-4 h-4 text-red-loss" />
            }
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>

        {/* ── Mobile bottom navigation ── */}
        <nav className="md:hidden flex border-t border-dark-700 bg-dark-900 safe-area-bottom">
          {navItems.slice(0, 5).map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                cn(
                  'flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors',
                  isActive ? 'text-gold' : 'text-gray-500'
                )
              }
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px]">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
