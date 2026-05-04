import { auth, signOut } from '@/auth'

export default async function AppHome() {
  const session = await auth()
  const name = session?.user?.name ?? session?.user?.email ?? 'researcher'

  return (
    <main className="bg-bg min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="border-border-subtle flex items-center justify-between border-b pb-6">
          <div>
            <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
              today&apos;s briefing
            </p>
            <h1 className="font-display text-ink mt-1 text-3xl">
              Hello, {name}.
            </h1>
          </div>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/' })
            }}
          >
            <button
              type="submit"
              className="text-ink-muted hover:text-ink text-sm"
            >
              Sign out
            </button>
          </form>
        </header>

        <section className="mt-10">
          <p className="text-ink-muted text-sm leading-relaxed">
            Briefings will appear here once you finish onboarding and your first
            agent run completes. The agents are not yet wired up — this is the
            Phase 1 foundation.
          </p>
        </section>
      </div>
    </main>
  )
}
