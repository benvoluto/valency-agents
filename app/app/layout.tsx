import { requireUser } from '@/lib/auth-helpers'
import { UndoBar } from '@/components/surface/UndoBar'
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
      <main
        id="main"
        className="px-4 py-6 sm:px-6 sm:py-10"
      >
        {children}
      </main>
      <UndoBar userId={user.id} />
    </div>
  )
}
