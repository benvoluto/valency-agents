import type { Metadata } from 'next'
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Research Agents',
  description:
    'A small team of Claude agents that pre-runs the research questions you would otherwise type by hand.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans antialiased">
        <a
          href="#main"
          className="bg-ink text-surface focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 absolute left-2 top-2 z-50 -translate-y-32 rounded-md px-3 py-2 text-sm font-medium transition focus:translate-y-0"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  )
}
