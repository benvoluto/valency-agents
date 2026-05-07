/**
 * Constrains content width for forms, lists, and reading-style pages.
 * The briefing home and the knowledge map are intentionally outside this
 * group so they can use full viewport width — more cards / a larger graph
 * fit on wide displays.
 */
export default function NarrowLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="mx-auto max-w-5xl">{children}</div>
}
