import { ArrowRight } from '@phosphor-icons/react/dist/ssr'

type Step = 'identity' | 'summary' | 'cadence'

const STEPS: { key: Step; label: string }[] = [
  { key: 'identity', label: 'Who you are' },
  { key: 'summary', label: 'Research summary' },
  { key: 'cadence', label: 'Cadence' },
]

export function StepIndicator({ active }: { active: Step }) {
  return (
    <ol className="text-ink-muted mb-8 flex items-center gap-3 font-mono text-xs uppercase tracking-wider">
      {STEPS.map((s, i) => {
        const isActive = s.key === active
        const isPast = STEPS.findIndex((x) => x.key === active) > i
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={
                isActive
                  ? 'text-ink'
                  : isPast
                    ? 'text-ink-muted'
                    : 'text-ink-muted'
              }
            >
              {String(i + 1).padStart(2, '0')} · {s.label}
            </span>
            {i < STEPS.length - 1 ? (
              <ArrowRight size={12} weight="regular" aria-hidden />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
