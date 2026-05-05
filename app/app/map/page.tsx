import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { buildKnowledgeGraph } from '@/lib/graph/buildGraph'
import { MapView } from './MapView'

export const dynamic = 'force-dynamic'

export default async function MapPage() {
  const user = await requireOnboardedUser()
  const graph = await buildKnowledgeGraph(user.id)

  return (
    <>
      <header className="mb-6">
        <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
          knowledge map
        </p>
        <h1 className="font-display text-ink mt-1 text-3xl">
          Last 90 days, mapped.
        </h1>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          Briefings, tags, papers, and authors as a force-directed graph.
          Click a node to filter the briefing list below it. Drag to
          rearrange.
        </p>
        <p className="text-ink-muted mt-2 font-mono text-[11px]">
          {graph.nodes.length} node{graph.nodes.length === 1 ? '' : 's'}
          {graph.truncated
            ? ` (trimmed from ${graph.rawCount} for performance)`
            : ''}
        </p>
      </header>

      {graph.nodes.length === 0 ? (
        <section className="bg-surface border-border-subtle rounded-2xl border p-8">
          <h2 className="font-display text-ink text-xl">Nothing to map yet.</h2>
          <p className="text-ink-muted mt-2 text-sm leading-relaxed">
            Once briefings start landing, they&apos;ll appear here connected
            to the tags + papers + authors that produced them.
          </p>
          <Link
            href="/app/goals"
            className="text-accent mt-3 inline-flex items-center gap-1 text-sm hover:underline"
          >
            Manage goals
            <ArrowRight size={14} weight="regular" aria-hidden />
          </Link>
        </section>
      ) : (
        <MapView graph={graph} />
      )}
    </>
  )
}
