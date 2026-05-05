import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { briefings } from '@/db/schema'

/** E2E-only helper: looks up a briefing's shortId by id. */
export async function GET(req: Request) {
  if (process.env.E2E_TEST_MODE !== 'true') {
    return new Response('disabled', { status: 404 })
  }
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return Response.json({ error: 'id required' }, { status: 400 })
  }
  const [b] = await db
    .select({ shortId: briefings.shortId })
    .from(briefings)
    .where(eq(briefings.id, id))
    .limit(1)
  if (!b) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json({ shortId: b.shortId })
}
