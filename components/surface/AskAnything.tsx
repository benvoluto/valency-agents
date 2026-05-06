'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AskAnything() {
  const router = useRouter()
  const [value, setValue] = useState('')
  return (
    <section>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const q = value.trim()
          if (!q) return
          router.push(`/app/chat?q=${encodeURIComponent(q)}`)
        }}
      >
        <label htmlFor="ask-anything" className="sr-only">
          Ask any question
        </label>
        <input
          id="ask-anything"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask any question..."
          className="bg-surface border-border-subtle text-ink placeholder:text-ink-muted block w-full rounded-2xl border px-4 py-4 text-sm shadow-sm focus:outline-2 focus:outline-accent"
        />
      </form>
    </section>
  )
}
