import type { Metadata } from 'next'
import { Fraunces, Manrope } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'

// Inter - Clean body font
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700']
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-heading',
  weight: ['500', '600', '700']
})

export const metadata: Metadata = {
  title: 'Gavel - Premium Auction Platform',
  description: 'Timeless Prestige. Live Online. High-end auctions reimagined with trust, elegance, and real-time bidding.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${fraunces.variable}`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
