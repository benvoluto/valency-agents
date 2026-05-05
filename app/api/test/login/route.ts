import { encode } from 'next-auth/jwt'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'

const COOKIE_NAME = 'authjs.session-token'

/**
 * E2E-only login. Refuses to do anything unless E2E_TEST_MODE === 'true'.
 * Upserts a user by email, mints a session JWT, and sets the session cookie.
 */
export async function POST(req: Request) {
  if (process.env.E2E_TEST_MODE !== 'true') {
    return new Response('disabled', { status: 404 })
  }
  const body = (await req.json()) as {
    email?: string
    name?: string
    completeOnboarding?: boolean
  }
  const email = body.email
  const name = body.name ?? null
  const completeOnboarding = body.completeOnboarding === true
  if (!email) {
    return Response.json({ error: 'email required' }, { status: 400 })
  }
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    return Response.json({ error: 'AUTH_SECRET not set' }, { status: 500 })
  }

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) {
    const [created] = await db
      .insert(users)
      .values({
        email,
        name,
        onboardingCompletedAt: completeOnboarding ? new Date() : null,
      })
      .returning()
    user = created
  } else {
    const updates: Partial<typeof users.$inferInsert> = {}
    if (name && user.name !== name) updates.name = name
    if (completeOnboarding && !user.onboardingCompletedAt) {
      updates.onboardingCompletedAt = new Date()
    }
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, user.id))
      user = { ...user, ...updates }
    }
  }

  const maxAge = 60 * 60 * 24
  const token = await encode({
    token: {
      id: user.id,
      sub: user.id,
      email: user.email,
      name: user.name,
    },
    secret,
    salt: COOKIE_NAME,
    maxAge,
  })

  const res = Response.json({ ok: true, userId: user.id })
  res.headers.append(
    'set-cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
  )
  return res
}
