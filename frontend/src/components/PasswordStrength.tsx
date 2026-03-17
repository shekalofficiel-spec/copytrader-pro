import { cn } from '../lib/utils'

interface Check {
  label: string
  ok: boolean
}

function getChecks(password: string, email = ''): Check[] {
  return [
    { label: '10 caractères minimum', ok: password.length >= 10 },
    { label: 'Majuscule (A-Z)', ok: /[A-Z]/.test(password) },
    { label: 'Minuscule (a-z)', ok: /[a-z]/.test(password) },
    { label: 'Chiffre (0-9)', ok: /[0-9]/.test(password) },
    { label: 'Caractère spécial (!@#$...)', ok: /[!@#$%^&*()\-_=+\[\]{}]/.test(password) },
    ...(email ? [{ label: "Ne contient pas l'email", ok: !password.toLowerCase().includes(email.split('@')[0].toLowerCase()) }] : []),
  ]
}

function getScore(checks: Check[]): number {
  return checks.filter(c => c.ok).length
}

const STRENGTH_LABELS = ['', 'Très faible', 'Faible', 'Moyen', 'Fort', 'Très fort', 'Parfait']
const STRENGTH_COLORS = ['', 'bg-[#f87171]', 'bg-[#f87171]', 'bg-[#fb923c]', 'bg-yellow-400', 'bg-[#4ade80]', 'bg-[#c8f135]']

interface Props {
  password: string
  email?: string
}

export default function PasswordStrength({ password, email = '' }: Props) {
  if (!password) return null
  const checks = getChecks(password, email)
  const score = getScore(checks)
  const total = checks.length

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-all duration-300',
              i < score ? STRENGTH_COLORS[score] : 'bg-[#242424]'
            )}
          />
        ))}
      </div>
      <p className={cn('text-xs font-medium', score >= 5 ? 'text-[#4ade80]' : score >= 3 ? 'text-yellow-400' : 'text-[#f87171]')}>
        {STRENGTH_LABELS[score] || ''}
      </p>
      {/* Checklist */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5 text-xs">
            <span className={c.ok ? 'text-[#4ade80]' : 'text-[#555]'}>
              {c.ok ? '✓' : '○'}
            </span>
            <span className={c.ok ? 'text-[#8a8a8a]' : 'text-[#444]'}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
