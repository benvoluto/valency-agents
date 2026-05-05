'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { GraphData } from '@/lib/graph/buildGraph'

const COLOR: Record<string, string> = {
  briefing: '#141414',
  tag: '#3A4FBF',
  paper: '#2E5BFF',
  author: '#0F8B7A',
}

interface SelectedNode {
  id: string
  label: string
  type: 'tag' | 'paper' | 'author' | 'briefing'
}

export function MapView({ graph }: { graph: GraphData }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<unknown>(null)
  const [selected, setSelected] = useState<SelectedNode | null>(null)
  const [renderedMs, setRenderedMs] = useState<number | null>(null)

  const elements = useMemo(() => {
    const ns = graph.nodes.map((n) => ({
      data: { id: n.id, label: n.label, type: n.type },
    }))
    const es = graph.edges.map((e, i) => ({
      data: {
        id: `e${i}`,
        source: e.source,
        target: e.target,
        kind: e.kind,
      },
    }))
    return [...ns, ...es]
  }, [graph])

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    const start = performance.now()

    ;(async () => {
      const cytoscape = (await import('cytoscape')).default
      if (cancelled || !containerRef.current) return
      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              'background-color': (e: { data: (k: string) => string }) =>
                COLOR[e.data('type')] ?? '#5C5C5C',
              label: 'data(label)',
              'font-size': 9,
              'font-family': 'Inter, system-ui, sans-serif',
              color: '#5C5C5C',
              'text-margin-y': -6,
              'text-wrap': 'ellipsis',
              'text-max-width': '100',
              'min-zoomed-font-size': 6,
              width: (e: { data: (k: string) => string }) =>
                e.data('type') === 'briefing' ? 16 : 10,
              height: (e: { data: (k: string) => string }) =>
                e.data('type') === 'briefing' ? 16 : 10,
              'border-width': 0,
            },
          },
          {
            selector: 'edge',
            style: {
              'line-color': '#E6E4DE',
              width: 1,
              'curve-style': 'haystack',
              'haystack-radius': 0,
              opacity: 0.6,
            },
          },
          {
            selector: 'node:selected',
            style: {
              'border-width': 2,
              'border-color': '#3A4FBF',
              color: '#141414',
            },
          },
        ],
        layout: {
          name: 'cose',
          animate: false,
          fit: true,
          padding: 20,
          idealEdgeLength: () => 60,
          nodeRepulsion: () => 4000,
        },
        wheelSensitivity: 0.2,
      })

      cy.on('tap', 'node', (evt) => {
        const n = evt.target
        setSelected({
          id: n.id() as string,
          label: n.data('label') as string,
          type: n.data('type') as SelectedNode['type'],
        })
      })
      cy.on('dbltap', 'node[type = "author"]', (evt) => {
        const id = (evt.target.id() as string).replace(/^a:/, '')
        // Author profile is just an external link for now (Phase 11 scope).
        window.open(`https://orcid.org/${id}`, '_blank', 'noreferrer')
      })

      cyRef.current = cy as unknown
      setRenderedMs(performance.now() - start)
    })()

    return () => {
      cancelled = true
      const cy = cyRef.current as { destroy?: () => void } | null
      if (cy?.destroy) cy.destroy()
      cyRef.current = null
    }
  }, [elements])

  return (
    <>
      <section
        className="bg-surface border-border-subtle relative overflow-hidden rounded-2xl border"
        style={{ height: 560 }}
      >
        <div
          ref={containerRef}
          data-testid="cy-container"
          className="h-full w-full"
        />
        {renderedMs !== null ? (
          <p
            className="text-ink-muted absolute right-3 bottom-2 font-mono text-[10px]"
            data-testid="cy-render-ms"
          >
            {Math.round(renderedMs)}ms
          </p>
        ) : null}
      </section>

      <Legend />

      <SelectedNodePanel selected={selected} />
    </>
  )
}

function Legend() {
  const items: { type: SelectedNode['type']; label: string }[] = [
    { type: 'briefing', label: 'briefing' },
    { type: 'tag', label: 'tag' },
    { type: 'paper', label: 'paper' },
    { type: 'author', label: 'author' },
  ]
  return (
    <ul className="text-ink-muted mt-4 flex flex-wrap items-center gap-4 text-xs">
      {items.map((i) => (
        <li key={i.type} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: COLOR[i.type] }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

function SelectedNodePanel({ selected }: { selected: SelectedNode | null }) {
  if (!selected) return null
  const [prefix, ref] = selected.id.split(':', 2)
  const link =
    prefix === 't'
      ? null // we'll resolve below
      : prefix === 'b'
        ? `/app/briefings/${ref}`
        : null
  return (
    <section
      data-testid="selected-node"
      className="bg-surface border-border-subtle mt-6 rounded-2xl border p-5"
    >
      <p className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
        Selected · {selected.type}
      </p>
      <p className="text-ink mt-1 text-base font-medium">{selected.label}</p>
      <p className="text-ink-muted mt-1 font-mono text-[11px]">
        {selected.id}
      </p>
      {link ? (
        <Link
          href={link}
          className="text-accent mt-3 inline-block text-sm hover:underline"
        >
          Open →
        </Link>
      ) : null}
      {prefix === 't' ? (
        <SelectedTagLink id={selected.id.slice(2)} />
      ) : null}
    </section>
  )
}

function SelectedTagLink({ id }: { id: string }) {
  // The id is the tag UUID; we can't link to /app/topics/<slug> without it.
  // Provide a search-by-tag-id path via /app/topics?id=… is overkill;
  // surface "All topics" as the next step. Phase 11 keeps this minimal.
  void id
  return (
    <Link
      href="/app/topics"
      className="text-accent mt-3 inline-block text-sm hover:underline"
    >
      Open in topics →
    </Link>
  )
}
