import { sendViaMailgun } from './mailgun'

/** Brief HTML+text body sent back as confirmation after an inbound action. */
export async function sendConfirmationReply(args: {
  to: string
  subject: string
  summary: string
  link: string
}) {
  const html = `<!doctype html><html><body style="font-family:Inter,system-ui,sans-serif;color:#141414;background:#FAFAF7;padding:24px">
  <p style="margin:0 0 12px 0;font-size:14px;color:#5C5C5C;font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:0.08em;text-transform:uppercase;font-size:11px">Got it.</p>
  <p style="margin:0 0 12px 0;font-size:16px;color:#141414">${escapeHtml(args.summary)}</p>
  <p style="margin:0;font-size:13px"><a href="${escapeAttr(args.link)}" style="color:#3A4FBF;text-decoration:underline">View briefing</a></p>
</body></html>`
  const text = `Got it.\n\n${args.summary}\n\nView: ${args.link}\n`

  return sendViaMailgun({
    to: args.to,
    subject: `Re: ${args.subject}`,
    html,
    text,
    headers: { 'In-Reply-To': '<digest@researchagents.io>' },
    tags: ['confirmation'],
  })
}

/** Polite reply to senders we don't recognize. */
export async function sendBounceReply(args: {
  to: string
  subject: string
}) {
  const html = `<!doctype html><html><body style="font-family:Inter,system-ui,sans-serif;color:#141414;background:#FAFAF7;padding:24px">
  <p style="margin:0 0 12px 0;font-size:14px">We don't recognize this address — only registered Research Agents users can act on briefings via email.</p>
  <p style="margin:0;font-size:13px;color:#5C5C5C">If this is your address, sign in at <a href="https://researchagents.io/app" style="color:#3A4FBF;text-decoration:underline">researchagents.io</a> first; the email address you sign in with is the one we'll accept replies from.</p>
</body></html>`
  const text =
    "We don't recognize this address — only registered Research Agents users can act on briefings via email.\n\n" +
    "Sign in at https://researchagents.io/app first; the email address you sign in with is the one we'll accept replies from.\n"

  return sendViaMailgun({
    to: args.to,
    subject: `Re: ${args.subject}`,
    html,
    text,
    tags: ['bounce'],
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}
