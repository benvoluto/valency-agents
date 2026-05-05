import { redirect } from 'next/navigation'
import { requireUser } from './auth-helpers'
import type { User } from '@/db/schema'

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdmin(user: Pick<User, 'email'>): boolean {
  if (!user.email) return false
  const allow = adminEmails()
  if (allow.length === 0) return false
  return allow.includes(user.email.toLowerCase())
}

export async function requireAdminUser(): Promise<User> {
  const user = await requireUser()
  if (!isAdmin(user)) {
    redirect('/app')
  }
  return user
}
