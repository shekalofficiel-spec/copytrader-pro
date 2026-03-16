import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { billingApi } from '../lib/api'
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Subscription Plans</h1>
        <p className="text-gray-400 mt-1">
          Current plan: <span className="text-blue-400 font-semibold">{currentTier}</span>
          {sub && ` — up to ${sub.max_slaves} slave account${sub.max_slaves === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map(plan => {
          const isCurrent = plan.id.toUpperCase() === currentTier
          return (
            <div
              key={plan.id}
              className={`relative rounded-xl border p-6 flex flex-col ${
                plan.highlight
                  ? 'border-blue-500 bg-blue-950/20'
                  : 'border-gray-700 bg-gray-900'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    MOST POPULAR
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h2 className="text-lg font-bold text-white">{plan.name}</h2>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">{plan.price}</span>
                  <span className="text-gray-400 text-sm">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-2 flex-1 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrent || loading !== null}
                className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                  isCurrent
                    ? 'bg-gray-700 text-gray-400 cursor-default'
                    : plan.highlight
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                } disabled:opacity-60`}
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

      <p className="mt-8 text-center text-xs text-gray-600">
        Payments processed securely by Stripe. Cancel anytime.
      </p>
    </div>
  )
}
