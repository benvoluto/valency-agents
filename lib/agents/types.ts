import type { ZodType } from 'zod'

export type AgentRole = 'scout' | 'analyst' | 'librarian' | 'editor'

export interface AgentDefinition<TOutput> {
  role: AgentRole
  /** Model used by default; the orchestrator may downgrade non-Editor roles. */
  defaultModel: string
  /** System prompt — terse, role-specific. */
  system: string
  /** Allowed Valency tool names (empty for Editor). */
  allowedValencyTools: string[]
  /** JSON schema describing the output. Sent via `output_config.format`. */
  outputJsonSchema: Record<string, unknown>
  /** Zod schema used to parse + validate the model's JSON output. */
  outputSchema: ZodType<TOutput>
  /** Soft cap on tokens per call; tighter for the smaller agents. */
  maxOutputTokens: number
}
