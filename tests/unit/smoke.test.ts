import { describe, expect, it } from 'vitest'

describe('foundation smoke', () => {
  it('environment is sane', () => {
    expect(typeof crypto.randomUUID()).toBe('string')
  })
})
