import { describe, expect, it } from 'vitest'
import { ScoutOutput } from '@/lib/agents/scout'
import { AnalystOutput } from '@/lib/agents/analyst'
import { LibrarianOutput } from '@/lib/agents/librarian'
import { EditorOutput } from '@/lib/agents/editor'

describe('agent schemas', () => {
  it('ScoutOutput accepts a representative response', () => {
    const ok = {
      candidates: [
        {
          paper_id: '2501.12345',
          title: 'A study of long-context attention',
          why: 'matched semantic_search "long context" at high rank',
          source_seed: 'long context',
          source_tools: ['semantic_search_papers'],
        },
      ],
      warnings: [],
    }
    expect(() => ScoutOutput.parse(ok)).not.toThrow()
  })

  it('ScoutOutput rejects a missing-required-field response', () => {
    const bad = { candidates: [{ paper_id: 'x', title: 'y' }] }
    expect(() => ScoutOutput.parse(bad)).toThrow()
  })

  it('AnalystOutput accepts and enforces score bounds', () => {
    const ok = {
      shortlist: [
        {
          paper_id: '2501.12345',
          title: 'A study',
          novelty: 0.9,
          relevance: 0.8,
          source_strength: 0.7,
          composite: 0.83,
          evidence: ['cited by 3 papers in your library'],
          flag: 'new_paper',
        },
      ],
    }
    expect(() => AnalystOutput.parse(ok)).not.toThrow()

    const tooHigh = { ...ok, shortlist: [{ ...ok.shortlist[0], novelty: 1.5 }] }
    expect(() => AnalystOutput.parse(tooHigh)).toThrow()
  })

  it('LibrarianOutput accepts and tags require non-empty paper_ids', () => {
    const ok = {
      papers: [{ paper_id: '2501.12345', title: 'A study' }],
      authors: [{ display_name: 'Jane Doe' }],
      tags: [
        { slug: 'long-context', label: 'Long context', paper_ids: ['2501.12345'], score: 0.9 },
      ],
    }
    expect(() => LibrarianOutput.parse(ok)).not.toThrow()

    const bad = {
      ...ok,
      tags: [{ slug: 't', label: 'T', paper_ids: [], score: 0.5 }],
    }
    expect(() => LibrarianOutput.parse(bad)).toThrow()
  })

  it('EditorOutput accepts a complete briefing', () => {
    const ok = {
      briefings: [
        {
          kind: 'new_paper',
          priority: 'opportunity',
          title: 'New paper on attention sinks',
          summary:
            'A v2 was posted yesterday by someone you follow that addresses your goal directly.',
          confidence: 0.88,
          reasoning:
            'Why this surfaced. The author appears in your follow list and the v2 reframes the open question in your draft section 3.',
          what_i_will_do:
            "I'll save this paper to your library and draft a paragraph for your section 3.",
          scope: { date_range: '30d' },
          alternatives_considered: ['paper X — same topic but older'],
          sources: [
            { kind: 'paper', ref_id: '2501.12345', weight: 1 },
            { kind: 'author', ref_id: '0000-0001-2345-6789' },
          ],
          tag_slugs: ['long-context'],
        },
      ],
    }
    expect(() => EditorOutput.parse(ok)).not.toThrow()
  })

  it('EditorOutput rejects a confidence outside [0,1]', () => {
    const ok = {
      briefings: [
        {
          kind: 'new_paper',
          priority: 'opportunity',
          title: 'A title that is long enough',
          summary:
            'A v2 was posted yesterday by someone you follow that addresses your goal directly.',
          confidence: 1.2,
          reasoning:
            'Why this surfaced. The author appears in your follow list and the v2 reframes the open question.',
          what_i_will_do: 'Save and draft a paragraph.',
          sources: [{ kind: 'paper' as const, ref_id: '2501.12345' }],
        },
      ],
    }
    expect(() => EditorOutput.parse(ok)).toThrow()
  })

  it('EditorOutput rejects a briefing with no sources', () => {
    const bad = {
      briefings: [
        {
          kind: 'new_paper',
          priority: 'opportunity',
          title: 'Title that is long enough',
          summary: 'A summary that is long enough to pass minLength validation.',
          confidence: 0.9,
          reasoning: 'Reasoning that is long enough to pass minLength validation.',
          what_i_will_do: 'Save and draft.',
          sources: [],
        },
      ],
    }
    expect(() => EditorOutput.parse(bad)).toThrow()
  })
})
