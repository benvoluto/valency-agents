import { describe, expect, it } from 'vitest'
import { parseInboundIntent, stripQuotedReply } from '@/lib/email/inbound'

describe('stripQuotedReply', () => {
  it('removes lines beginning with a quote marker', () => {
    const body = `approve abc12345

> On Mon, Researchers Agents wrote:
> Here's your briefing.`
    expect(stripQuotedReply(body)).toBe('approve abc12345')
  })

  it('cuts at "On … wrote:" headers', () => {
    const body = `dismiss abc12345
On Mon, May 4 at 7:00 AM, Research Agents wrote:
old content`
    expect(stripQuotedReply(body)).toBe('dismiss abc12345')
  })

  it('cuts at "From:" reply blocks', () => {
    const body = `more abc12345

From: agents@researchagents.io
Sent: Mon
…`
    expect(stripQuotedReply(body)).toBe('more abc12345')
  })

  it('handles a "Sent from my iPhone" footer', () => {
    const body = `approve abc12345
Sent from my iPhone`
    expect(stripQuotedReply(body)).toBe('approve abc12345')
  })
})

describe('parseInboundIntent (regex)', () => {
  it('matches lower-case approve + 8-char shortId', async () => {
    const r = await parseInboundIntent('approve abc12345', {
      allowLlmFallback: false,
    })
    expect(r).toMatchObject({
      kind: 'approve',
      shortId: 'abc12345',
      source: 'regex',
      confidence: 1,
    })
  })

  it('case-insensitive verb, normalizes shortId to lower', async () => {
    const r = await parseInboundIntent('DISMISS ABC12345', {
      allowLlmFallback: false,
    })
    expect(r.kind).toBe('dismiss')
    expect(r.shortId).toBe('abc12345')
  })

  it('matches across the four supported verbs', async () => {
    for (const v of ['approve', 'dismiss', 'more', 'snooze'] as const) {
      const r = await parseInboundIntent(`${v} abc12345`, {
        allowLlmFallback: false,
      })
      expect(r.kind).toBe(v)
    }
  })

  it('rejects shortId outside 6–10 chars', async () => {
    const r = await parseInboundIntent('approve abc12', {
      allowLlmFallback: false,
    })
    expect(r.kind).toBeNull()
  })

  it('rejects unknown verbs', async () => {
    const r = await parseInboundIntent('delete abc12345', {
      allowLlmFallback: false,
    })
    expect(r.kind).toBeNull()
  })

  it('only inspects the first non-empty line', async () => {
    const r = await parseInboundIntent('\n\napprove abc12345\nsome other text', {
      allowLlmFallback: false,
    })
    expect(r.kind).toBe('approve')
  })

  it('strips quoted reply before parsing', async () => {
    const body = `approve abc12345

> On Mon, Research Agents wrote:
> A v2 challenges the premise of your draft section 3
> Reply: approve abc12345`
    const r = await parseInboundIntent(body, { allowLlmFallback: false })
    expect(r.kind).toBe('approve')
    expect(r.shortId).toBe('abc12345')
  })
})
