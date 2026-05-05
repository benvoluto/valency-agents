/**
 * Per-MTok prices for Claude models the agent team uses. Source:
 * https://www.anthropic.com/pricing — keep in sync when prices change.
 */
const PRICES_PER_MTOK: Record<
  string,
  { input: number; output: number }
> = {
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
}

export function priceUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICES_PER_MTOK[model]
  if (!p) return 0
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

export const OPUS = 'claude-opus-4-7' as const
export const HAIKU = 'claude-haiku-4-5-20251001' as const
