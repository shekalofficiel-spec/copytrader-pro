import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { billingApi } from '../lib/api'
import { cn } from '../lib/utils'
import type { SubscriptionInfo } from '../types'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    slaves: 1,
    features: ['1 Master account', '1 Slave account', 'All broker types', 'Basic dashboard'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$29',
    period: '/month',
    slaves: 5,
    features: ['1 Master account', '5 Slave accounts', 'Telegram alerts', 'Email reports', 'Priority support'],
    highlight: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$79',
    period: '/month',
    slaves: 999,
    features: ['Unlimited Masters', 'Unlimited Slaves', 'All Starter features', 'Prop firm mode', 'API access'],
  },
]

export default function Billing() {
  const { user } = useAuth()
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    billingApi.subscription().then(setSub).catch(() => {})
  }, [])

  const handleUpgrade = async (planId: string) => {
    if (planId === 'free') return
    setLoading(planId)
    try {
      const { url } = await billingApi.checkout(planId)
      window.location.href = url
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg || 'Failed to create checkout session. Make sure Stripe is configured.')
    } finally {
      setLoading(null)
    }
  }

  const currentTier = user?.subscription_tier || 'FREE'

  return (
    <div className="min-h-full bg-[#0f0f0f] p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Subscription Plans</h1>
          <p className="text-[#555] text-sm mt-1">
            Current plan:{' '}
            <span className="text-[#c8f135] font-semibold">{currentTier}</span>
            {sub && ` — up to ${sub.max_slaves} slave account${sub.max_slaves === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map(plan => {
            const isCurrent = plan.id.toUpperCase() === currentTier
            return (
              <div
                key={plan.id}
                className={cn(
                  'relative rounded-2xl border p-6 flex flex-col transition-all duration-200',
                  plan.highlight
                    ? 'border-[#c8f135]/40 bg-[#c8f135]/5 hover:border-[#c8f135]/60'
                    : isCurrent
                    ? 'border-[#333] bg-[#1a1a1a]'
                    : 'border-[#242424] bg-[#1a1a1a] hover:border-[#333]'
                )}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#c8f135] text-[#0f0f0f] text-xs font-bold px-3 py-1 rounded-full">
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h2 className={cn(
                    'text-base font-bold',
                    plan.highlight ? 'text-[#c8f135]' : 'text-white'
                  )}>{plan.name}</h2>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    <span className="text-[#555] text-sm">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-[#8a8a8a]">
                      <svg className={cn('w-4 h-4 flex-shrink-0', plan.highlight ? 'text-[#c8f135]' : 'text-[#4ade80]')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrent || loading !== null}
                  className={cn(
                    'w-full py-2.5 rounded-xl font-bold text-sm transition-all',
                    isCurrent
                      ? 'bg-[#242424] text-[#555] cursor-default border border-[#2a2a2a]'
                      : plan.highlight
                      ? 'bg-[#c8f135] text-[#0f0f0f] hover:bg-[#a8cc2a]'
                      : 'bg-[#242424] text-white hover:bg-[#2a2a2a] border border-[#333]',
                    'disabled:opacity-60'
                  )}
                >
                  {loading === plan.id
                    ? 'Redirecting...'
                    : isCurrent
                    ? 'Current Plan'
                    : plan.id === 'free'
                    ? 'Free Forever'
                    : `Upgrade to ${plan.name}`}
                </button>
              </div>
            )
          })}
        </div>

        <p className="mt-8 text-center text-xs text-[#444]">
          Payments processed securely by Stripe. Cancel anytime.
        </p>
      </div>
    </div>
  )
}
