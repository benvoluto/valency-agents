import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { render } from '@react-email/render'
import type { Briefing } from '@/db/schema'

export interface DigestBriefing {
  briefing: Briefing
  goalTitle: string | null
}

export interface DigestProps {
  recipientName: string
  appBaseUrl: string
  briefings: DigestBriefing[]
  runId?: string
  unsubscribeUrl: string
  preferencesUrl: string
  replyAddress: string
}

const PRIORITY_LABEL: Record<Briefing['priority'], string> = {
  critical: 'CRITICAL',
  process: 'IN PROCESS',
  opportunity: 'OPPORTUNITY',
  signal: 'SIGNAL',
}

const PRIORITY_COLOR: Record<Briefing['priority'], string> = {
  critical: '#C2410C',
  process: '#2E5BFF',
  opportunity: '#0F8B7A',
  signal: '#A56A00',
}

function band(c: number): string {
  if (c >= 0.9) return 'High'
  if (c >= 0.7) return 'Medium'
  return 'Low'
}

export function DigestEmail({
  recipientName,
  appBaseUrl,
  briefings,
  runId,
  unsubscribeUrl,
  preferencesUrl,
  replyAddress,
}: DigestProps) {
  const count = briefings.length
  const today = new Date().toISOString().slice(0, 10)
  const previewText = `${count} new briefing${count === 1 ? '' : 's'} for you · ${today}`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>RESEARCHAGENTS.IO</Text>
          <Text style={greetingStyle}>
            Hello, {recipientName}. {count} briefing{count === 1 ? '' : 's'} for you today.
          </Text>

          {briefings.map(({ briefing, goalTitle }) => (
            <Section key={briefing.id} style={cardStyle}>
              <Text style={{ ...prioStyle, color: PRIORITY_COLOR[briefing.priority] }}>
                [{PRIORITY_LABEL[briefing.priority]}] · {band(briefing.confidence)} ·{' '}
                {Math.round(briefing.confidence * 100)}%
              </Text>
              <Text style={titleStyle}>{briefing.title}</Text>
              {goalTitle ? (
                <Text style={contextStyle}>From your goal: {goalTitle}</Text>
              ) : null}
              <Text style={summaryStyle}>{briefing.summary}</Text>
              <Text style={linkRowStyle}>
                <Link
                  href={`${appBaseUrl}/app/briefings/${briefing.id}`}
                  style={linkStyle}
                >
                  Open in app
                </Link>{' '}
                ·{' '}
                <span style={mutedStyle}>
                  Reply: <code style={codeStyle}>approve {briefing.shortId}</code> ·{' '}
                  <code style={codeStyle}>dismiss {briefing.shortId}</code> ·{' '}
                  <code style={codeStyle}>more {briefing.shortId}</code>
                </span>
              </Text>
            </Section>
          ))}

          <Hr style={hrStyle} />

          <Text style={footerStyle}>
            Reply to this email to act on a briefing — send a one-line message
            like <code style={codeStyle}>approve abc12345</code> to{' '}
            <Link href={`mailto:${replyAddress}`} style={linkStyle}>
              {replyAddress}
            </Link>
            .
          </Text>
          {runId ? (
            <Text style={footerMonoStyle}>run · {runId}</Text>
          ) : null}
          <Text style={footerStyle}>
            <Link href={preferencesUrl} style={linkStyle}>
              Preferences
            </Link>{' '}
            ·{' '}
            <Link href={unsubscribeUrl} style={linkStyle}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const bodyStyle = {
  backgroundColor: '#FAFAF7',
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  color: '#141414',
}

const containerStyle = {
  maxWidth: '640px',
  margin: '0 auto',
  padding: '32px 24px',
}

const brandStyle = {
  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
  fontSize: '11px',
  letterSpacing: '0.08em',
  color: '#5C5C5C',
  margin: 0,
}

const greetingStyle = {
  fontFamily: 'Fraunces, ui-serif, Georgia, serif',
  fontSize: '24px',
  lineHeight: '1.3',
  color: '#141414',
  margin: '12px 0 28px 0',
}

const cardStyle = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E6E4DE',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '16px',
}

const prioStyle = {
  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
  fontSize: '11px',
  letterSpacing: '0.08em',
  margin: 0,
}

const titleStyle = {
  fontSize: '16px',
  fontWeight: 600,
  color: '#141414',
  margin: '8px 0 4px 0',
  lineHeight: '1.35',
}

const contextStyle = {
  fontSize: '12px',
  color: '#5C5C5C',
  margin: '0 0 8px 0',
}

const summaryStyle = {
  fontSize: '14px',
  color: '#141414',
  margin: '8px 0 12px 0',
  lineHeight: '1.55',
}

const linkRowStyle = {
  fontSize: '12px',
  color: '#5C5C5C',
  margin: 0,
}

const linkStyle = {
  color: '#3A4FBF',
  textDecoration: 'underline',
}

const mutedStyle = {
  color: '#5C5C5C',
}

const codeStyle = {
  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
  fontSize: '11px',
  backgroundColor: '#EEF1FF',
  color: '#3A4FBF',
  padding: '2px 4px',
  borderRadius: '3px',
}

const hrStyle = {
  borderColor: '#E6E4DE',
  margin: '32px 0 20px 0',
}

const footerStyle = {
  fontSize: '12px',
  color: '#5C5C5C',
  margin: '6px 0',
  lineHeight: '1.55',
}

const footerMonoStyle = {
  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
  fontSize: '11px',
  color: '#5C5C5C',
  margin: '12px 0 6px 0',
}

/**
 * Renders the digest as both an HTML string and a plain-text string. The
 * plain-text version is the email-client fallback.
 */
export async function renderDigest(props: DigestProps): Promise<{ html: string; text: string }> {
  const html = await render(<DigestEmail {...props} />)
  const text = await render(<DigestEmail {...props} />, { plainText: true })
  return { html, text }
}
