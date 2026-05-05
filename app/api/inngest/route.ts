import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { allFunctions } from '@/lib/inngest/functions'

// The pipeline runs scout → analyst → librarian → editor in one Inngest
// step today (see lib/pipeline/runGoal.ts). Each agent does Anthropic Opus
// 4.7 calls with Valency MCP attached, so a full run can take 3–5 min. Pro
// tier max is 800s — that gives us comfortable headroom.
//
// The architecturally-cleaner fix is to split the pipeline into per-agent
// steps so each gets its own 300s invocation budget; tracked separately.
export const maxDuration = 800

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: allFunctions,
})
