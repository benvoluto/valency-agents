import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'

export default async function LandingPage() {
  const session = await auth()
  if (session?.user) {
    redirect('/app')
  }

  return (
    <main className="bg-bg flex min-h-screen items-center justify-center px-6">
      <div className="bg-surface border-border-subtle w-full max-w-md rounded-2xl border p-10 shadow-sm">
        <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
          researchagents.io
        </p>
        <h1 className="font-display text-ink mt-3 text-3xl leading-tight">
          A small team of agents for your reading queue.
        </h1>
        <p className="text-ink-muted mt-4 text-sm leading-relaxed">
          Daily briefings on new papers, citations, and method shifts in your
          field — pre-run, ranked, and source-attributed before you ask.
        </p>

        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: '/app' })
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="bg-ink text-surface hover:bg-ink/90 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition"
          >
            Continue with Google
          </button>
        </form>

        <p className="text-ink-muted mt-6 text-xs">
          We use your Google account for sign-in only. No email, calendar, or
          drive access.
        </p>
      </div>
    </main>
  )
}
