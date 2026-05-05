import { describe, expect, it } from 'vitest'
import { INTERNAL_TOOLS } from '@/lib/chat/internalTools'

describe('internal tool registry', () => {
  it('exposes the four tools the plan calls for', () => {
    const names = INTERNAL_TOOLS.map((t) => t.name)
    expect(names).toEqual([
      'get_briefing',
      'get_goal',
      'list_recent_briefings',
      'search_library',
    ])
  })

  it('every tool has a JSON-schema input contract', () => {
    for (const t of INTERNAL_TOOLS) {
      expect(t.input_schema).toBeTypeOf('object')
      const schema = t.input_schema as { type?: string; additionalProperties?: boolean }
      expect(schema.type).toBe('object')
      expect(schema.additionalProperties).toBe(false)
    }
  })

  it('get_briefing and get_goal require an id', () => {
    const get = INTERNAL_TOOLS.find((t) => t.name === 'get_briefing')!
    const goal = INTERNAL_TOOLS.find((t) => t.name === 'get_goal')!
    for (const t of [get, goal]) {
      const schema = t.input_schema as { required?: string[] }
      expect(schema.required).toContain('id')
    }
  })

  it('search_library requires a query', () => {
    const t = INTERNAL_TOOLS.find((t) => t.name === 'search_library')!
    const schema = t.input_schema as { required?: string[] }
    expect(schema.required).toContain('query')
  })

  it('every tool has a description ≥ 40 chars', () => {
    for (const t of INTERNAL_TOOLS) {
      expect(t.description.length).toBeGreaterThanOrEqual(40)
    }
  })
})
