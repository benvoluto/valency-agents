import './globals.css'

export const metadata = {
  title: 'Valency Agents',
  description: 'Valency Agents',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
