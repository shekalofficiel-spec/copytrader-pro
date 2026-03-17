import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, TrendingUp, ScrollText, Settings,
  CreditCard, LogOut, Menu, X, BookOpen
} from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useState } from 'react'
import { tradesApi } from '../lib/api'
import { cn } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'
import Logo from './Logo'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/accounts', icon: Users, label: 'Accounts' },
  { path: '/trades', icon: TrendingUp, label: 'Trades' },
  { path: '/journal', icon: BookOpen, label: 'Journal' },
  { path: '/logs', icon: ScrollText, label: 'Logs' },
  { path: '/settings', icon: Settings, label: 'Settings' },
  { path: '/billing', icon: CreditCard, label: 'Billing' },
]

const TIER_COLORS: Record<string, string> = {
  FREE: 'bg-[#2a2a2a] text-[#8a8a8a]',
  STARTER: 'bg-neon/10 text-neon',
  PRO: 'bg-neon/20 text-neon border border-neon/30',
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
    try { await tradesApi.killSwitch() }
    finally { setKilling(false); setKillConfirm(false) }
  }

  const handleLogout = () => { logout(); navigate('/login') }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#2a2a2a]">
        <Logo size={30} showText={true} />
      </div>

      {/* Live status pill */}
      <div className="px-4 pt-4">
        <div className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium w-fit',
          isConnected
            ? 'bg-neon/10 text-neon border border-neon/20'
            : 'bg-loss/10 text-loss border border-loss/20'
        )}>
          <span className={cn(
            'w-1.5 h-1.5 rounded-full',
            isConnected ? 'bg-neon animate-pulse' : 'bg-loss'
          )} />
          {isConnected ? 'Live Connected' : 'Reconnecting...'}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-4 space-y-0.5">
        {navItems.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              isActive
                ? 'bg-neon/10 text-neon border border-neon/15'
                : 'text-[#8a8a8a] hover:text-white hover:bg-[#242424]'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-4 border-t border-[#2a2a2a] space-y-3">
        {/* Kill switch */}
        <button
          onClick={handleKillSwitch}
          disabled={killing}
          className={cn(
            'w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all border',
            killConfirm
              ? 'bg-loss border-loss text-white'
              : 'bg-transparent border-[#2a2a2a] text-[#8a8a8a] hover:border-loss/50 hover:text-loss'
          )}
        >
          {killing ? 'Closing all...' : killConfirm ? 'Confirm Kill Switch?' : 'Kill Switch'}
        </button>

        {/* User info */}
        {user && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-neon/15 border border-neon/25 flex items-center justify-center text-neon text-xs font-bold shrink-0">
              {user.full_name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium truncate">{user.full_name || 'User'}</p>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold', TIER_COLORS[user.subscription_tier] || TIER_COLORS.FREE)}>
                {user.subscription_tier}
              </span>
            </div>
            <button onClick={handleLogout} className="text-[#555] hover:text-loss transition-colors shrink-0">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-[#0f0f0f] text-white overflow-hidden">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-[#141414] border-r border-[#222] flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-[#141414] border-r border-[#222] flex flex-col">
            <button
              className="absolute top-4 right-4 text-[#555] hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile topbar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-[#141414] border-b border-[#222]">
          <button onClick={() => setSidebarOpen(true)} className="text-[#555] hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <Logo size={26} showText={true} />
          <div className={cn(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-neon animate-pulse' : 'bg-loss'
          )} />
        </div>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden flex border-t border-[#222] bg-[#141414] safe-area-bottom">
          {navItems.slice(0, 5).map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => cn(
                'flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors',
                isActive ? 'text-neon' : 'text-[#555]'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
