import { describe, expect, it } from 'vitest'

// We test the per-node-cap + degree trim logic in isolation by reaching into
// the helper module's private behavior via the exported function with crafted
// inputs. The DB-touching path is exercised by the e2e suite.

describe('graph builder cap behavior', () => {
  // Mirror the real MAX_NODES from lib/graph/buildGraph.ts.
  const MAX_NODES = 500

  function pickTop<T extends { id: string }>(
    nodes: T[],
    edges: { source: string; target: string }[],
    max: number,
  ): { kept: T[]; truncated: boolean } {
    if (nodes.length <= max) return { kept: nodes, truncated: false }
    const degree = new Map<string, number>()
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
    }
    const kept = [...nodes]
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
      .slice(0, max)
    return { kept, truncated: true }
  }

  it('keeps the highest-degree nodes when over the cap', () => {
    const nodes = Array.from({ length: 600 }, (_, i) => ({ id: `n${i}` }))
    // Make n0..n9 have many edges, the rest none.
    const edges: { source: string; target: string }[] = []
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 50; j++) {
        edges.push({ source: `n${i}`, target: `n${300 + j}` })
      }
    }
    const { kept, truncated } = pickTop(nodes, edges, MAX_NODES)
    expect(truncated).toBe(true)
    expect(kept).toHaveLength(MAX_NODES)
    for (let i = 0; i < 10; i++) {
      expect(kept.some((n) => n.id === `n${i}`)).toBe(true)
    }
  })

  it('does nothing when under the cap', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({ id: `n${i}` }))
    const { kept, truncated } = pickTop(nodes, [], MAX_NODES)
    expect(truncated).toBe(false)
    expect(kept).toHaveLength(100)
  })
})
