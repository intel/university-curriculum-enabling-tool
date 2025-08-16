import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/providers/theme-provider'
import { cn } from '@/lib/utils'

import './globals.css'

const fontSans = GeistSans

const META_THEME_COLORS = {
  light: '#ffffff',
  dark: '#09090b',
}

export const metadata: Metadata = {
  title: 'University Curriculum Enabling Tool',
  description: 'University Curriculum Enabling Tool web interface',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/favicon.ico', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: META_THEME_COLORS.light,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        {/* ThemeColorUpdater updates the meta theme-color tag after hydration */}
        <meta name="theme-color" content={META_THEME_COLORS.light} />
      </head>
      <body
        suppressHydrationWarning
        className={cn('min-h-svh overscroll-none bg-background antialiased', fontSans.className)}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
