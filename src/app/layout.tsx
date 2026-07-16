import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Lists Manager',
  description: 'Reusable checklist templates with recurring instances',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Lists Manager' },
  // Explicit icon: setting `icons` here suppresses the app/icon.png file
  // convention, so the tab favicon must be declared alongside apple.
  icons: { icon: '/icon.png', apple: '/icon-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#4f46e5',
}

// Stamp the saved theme on <html> before paint so there's no flash.
const themeInit = `try{var t=localStorage.getItem('lm-theme');if(t==='iris'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}`

// Register the service worker so the app can be installed to a home screen.
const swInit = `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script dangerouslySetInnerHTML={{ __html: swInit }} />
      </head>
      <body className={`${inter.className} min-h-full`}>{children}</body>
    </html>
  )
}
