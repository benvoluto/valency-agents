import { describe, expect, it } from 'vitest'
import { renderDigest } from '@/lib/email/digest'
import type { Briefing } from '@/db/schema'

const briefing: Briefing = {
  id: 'b-1',
  userId: 'u-1',
  goalId: 'g-1',
  runId: null,
  kind: 'counter_evidence',
  priority: 'critical',
  status: 'pending',
  title: 'A v2 challenges the premise of your draft section 3',
  summary:
    'A revision posted yesterday by an author you follow argues the opposite of what your section 3 currently claims.',
  confidence: 0.91,
  shortId: 'abc12345',
  createdAt: new Date('2026-05-04T12:00:00Z'),
}

describe('renderDigest', () => {
  it('renders both HTML and plain text containing the title and short id', async () => {
    const { html, text } = await renderDigest({
      recipientName: 'Ben',
      appBaseUrl: 'https://researchagents.io',
      briefings: [{ briefing, goalTitle: 'Long-context attention research' }],
      unsubscribeUrl: 'https://researchagents.io/app/settings?unsubscribe=1',
      preferencesUrl: 'https://researchagents.io/app/settings',
      replyAddress: 'please-reply@researchagents.io',
    })
    expect(html).toContain('A v2 challenges')
    expect(html).toContain('CRITICAL')
    expect(html).toContain('abc12345')
    expect(html).toContain('https://researchagents.io/app/briefings/b-1')

    expect(text).toContain('A v2 challenges')
    expect(text).toContain('abc12345')
    expect(text).toContain('approve abc12345')
  })
})
