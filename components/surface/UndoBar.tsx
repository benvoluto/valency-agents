import { latestReversibleAction } from '@/lib/actions/apply'
import { UndoBarClient } from './UndoBarClient'

export async function UndoBar({ userId }: { userId: string }) {
  const target = await latestReversibleAction(userId)
  if (!target) return null
  const summary =
    (target.detailsJson?.summary as string | undefined) ?? `${target.kind}d`
  return (
    <UndoBarClient
      briefingId={target.briefingId}
      summary={summary}
      createdAtIso={target.createdAt.toISOString()}
    />
  )
}
