import { and, asc, desc, eq, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { auditEntries } from '@/db/schema'

export async function AuditTrail({
  briefingId,
  runId,
  limit = 20,
}: {
  briefingId?: string
  runId?: string
  limit?: number
}) {
  if (!briefingId && !runId) return null
  const where = briefingId
    ? and(
        eq(auditEntries.briefingId, briefingId),
        isNotNull(auditEntries.briefingId),
      )
    : eq(auditEntries.runId, runId!)
  const rows = await db
    .select()
    .from(auditEntries)
    .where(where)
    .orderBy(briefingId ? desc(auditEntries.ts) : asc(auditEntries.ts))
    .limit(limit)

  if (rows.length === 0) {
    return (
      <p className="text-ink-muted text-sm italic">
        No audit entries yet.
      </p>
    )
  }

  return (
    <ol className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.id}
          data-testid="audit-entry"
          className="border-border-subtle flex items-start gap-3 border-b py-2 last:border-b-0 text-sm"
        >
          <span className="text-ink-muted font-mono text-[11px] whitespace-nowrap">
            {r.ts.toISOString().slice(0, 16).replace('T', ' ')}
          </span>
          <span className="text-ink-muted font-mono text-[10px] tracking-wider uppercase">
            {r.source}
          </span>
          <span className="text-ink flex-1">{r.message}</span>
        </li>
      ))}
    </ol>
  )
}
