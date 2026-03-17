import { useRef, KeyboardEvent, ClipboardEvent } from 'react'
import { cn } from '../lib/utils'

interface OtpInputProps {
  value: string
  onChange: (val: string) => void
  length?: number
  disabled?: boolean
}

export default function OtpInput({ value, onChange, length = 6, disabled = false }: OtpInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(length, '').split('').slice(0, length)

  const focus = (i: number) => inputs.current[i]?.focus()

  const handleChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1)
    const next = digits.map((c, idx) => (idx === i ? d : c))
    onChange(next.join('').replace(/\s/g, ''))
    if (d && i < length - 1) focus(i + 1)
  }

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[i] && i > 0) {
        const next = digits.map((c, idx) => (idx === i - 1 ? '' : c))
        onChange(next.join(''))
        focus(i - 1)
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      focus(i - 1)
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      focus(i + 1)
    }
  }

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    onChange(pasted)
    focus(Math.min(pasted.length, length - 1))
  }

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={el => { inputs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ''}
          disabled={disabled}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          className={cn(
            'w-11 h-14 text-center text-xl font-bold rounded-xl border bg-[#141414] text-white',
            'focus:outline-none transition-all',
            digits[i]
              ? 'border-[#c8f135] bg-[#c8f135]/5'
              : 'border-[#2a2a2a] focus:border-[#c8f135]/60',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        />
      ))}
    </div>
  )
}
