'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AskAnything() {
  const router = useRouter()
  const [value, setValue] = useState('')
  return (
    <section className="bg-surface border-border-subtle rounded-2xl border p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const q = value.trim()
          if (!q) return
          router.push(`/app/chat?q=${encodeURIComponent(q)}`)
        }}
      >
        <label
          htmlFor="ask-anything"
          className="text-ink-muted block font-mono text-[11px] tracking-wider uppercase"
        >
          Ask any question
        </label>
        <input
          id="ask-anything"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. what cited my 2024 attention paper this week?"
          className="border-border-subtle text-ink placeholder:text-ink-muted/70 mt-2 block w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
        />
      </form>
    </section>
  )
}
