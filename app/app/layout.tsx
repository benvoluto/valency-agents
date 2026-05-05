import { requireUser } from '@/lib/auth-helpers'
import { AppNav } from './_components/app-nav'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  return (
    <div className="bg-bg min-h-screen">
      <AppNav user={user} />
      <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
    </div>
  )
}
