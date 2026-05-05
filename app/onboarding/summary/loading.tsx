export default function Loading() {
  return (
    <section className="bg-surface border-border-subtle rounded-2xl border p-8">
      <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
        analyzing your corpus
      </p>
      <h2 className="font-display text-ink mt-2 text-xl">
        Pulling your papers and writing up your research threads…
      </h2>
      <p className="text-ink-muted mt-3 text-sm">
        This usually takes 5–10 seconds. The agents are reading your titles
        and abstracts and grouping them into distinct goals.
      </p>
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="border-border-subtle animate-pulse rounded-md border p-4"
          >
            <div className="bg-border-subtle h-3 w-2/3 rounded" />
            <div className="bg-border-subtle mt-2 h-2 w-full rounded" />
            <div className="bg-border-subtle mt-1 h-2 w-5/6 rounded" />
          </div>
        ))}
      </div>
    </section>
  )
}
