import { createHmac, randomBytes } from 'node:crypto'

/**
 * Builds a Mailgun-shaped multipart/form-data inbound body, signed with the
 * test signing key.
 */
export interface MailgunInboundFields {
  sender: string
  recipient?: string
  subject?: string
  bodyPlain: string
  messageId?: string
}

export function buildSignedInbound(
  fields: MailgunInboundFields,
  signingKey: string,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const token = randomBytes(16).toString('hex')
  const signature = createHmac('sha256', signingKey)
    .update(`${timestamp}${token}`)
    .digest('hex')
  return {
    timestamp,
    token,
    signature,
    sender: fields.sender,
    recipient: fields.recipient ?? 'please-reply@researchagents.io',
    subject: fields.subject ?? 'Research Agents · 4 for you · 2026-05-04',
    'body-plain': fields.bodyPlain,
    'Message-Id': fields.messageId ?? `<${randomBytes(8).toString('hex')}@e2e.test>`,
  }
}
