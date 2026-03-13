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
              // Suppress long-press haptic vibration by disabling the Vibration API.
              // CSS touch-action:manipulation + -webkit-touch-callout:none handle the
              // visual callout; this stops the motor vibration on Android.
              `if(navigator.vibrate)navigator.vibrate=function(){return false};`,
            ].join('\n'),
          }}
        />
        {children}
      </body>
    </html>
  )
}
