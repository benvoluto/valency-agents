function band(c: number): { label: string; tone: string } {
  if (c >= 0.9) return { label: 'High', tone: 'text-priority-opportunity' }
  if (c >= 0.7) return { label: 'Medium', tone: 'text-priority-process' }
  return { label: 'Low', tone: 'text-priority-signal' }
}

export function ConfidenceChip({ confidence }: { confidence: number }) {
  const { label, tone } = band(confidence)
  const pct = Math.round(confidence * 100)
  return (
    <span
      className={`${tone} inline-flex items-center gap-1 font-mono text-[11px] font-medium tracking-wider`}
    >
      <span>{label}</span>
      <span aria-hidden>·</span>
      <span>{pct}%</span>
    </span>
  )
}
