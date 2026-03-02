import type { Metadata, Viewport } from 'next'
import './globals.css'
import FeedbackFab from '@/components/shared/FeedbackFab'

export const metadata: Metadata = {
  title: 'Epoch',
  description: 'A turn-based tactical strategy game where time is your most precious resource.',
}

export const viewport: Viewport = {
  themeColor: '#0a0e1a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <FeedbackFab />
      </body>
    </html>
  )
}
