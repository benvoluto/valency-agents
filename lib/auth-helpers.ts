import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { users, type User } from '@/db/schema'
import { eq } from 'drizzle-orm'

/** Returns the current session's user row, or redirects to `/`. */
export async function requireUser(): Promise<User> {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/')
  }
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)
  if (!user) {
    redirect('/')
  }
  return user
}

/** Returns the current user, redirecting to `/onboarding` if they haven't finished it. */
export async function requireOnboardedUser(): Promise<User> {
  const user = await requireUser()
  if (!user.onboardingCompletedAt) {
    redirect('/onboarding/identity')
  }
  return user
}
