import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Epoch',
  description: 'A turn-based tactical strategy game where time is your most precious resource.',
}

export const viewport: Viewport = {
  themeColor: '#0b0a0f',
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
        <script
          dangerouslySetInnerHTML={{
            __html: [
              // Suppress long-press context menu on game elements
              `document.addEventListener('contextmenu',function(e){if(e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA'){e.preventDefault()}});`,
              // Suppress long-press vibration/callout on Android & iOS.
              // preventDefault on touchstart stops the browser from entering
              // its long-press detection flow (which triggers haptic feedback).
              // Only applied to non-interactive elements so buttons/inputs work.
              `document.addEventListener('touchstart',function(e){var t=e.target;var n=t.tagName;if(n==='INPUT'||n==='TEXTAREA'||n==='BUTTON'||n==='SELECT'||t.closest('button,a,[role=button]'))return;e.preventDefault()},{passive:false});`,
            ].join('\n'),
          }}
        />
        {children}
      </body>
    </html>
  )
}
