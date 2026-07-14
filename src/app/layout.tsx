import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Lists Manager',
  description: 'Reusable checklist templates with recurring instances',
}

// Stamp the saved theme on <html> before paint so there's no flash.
const themeInit = `try{var t=localStorage.getItem('lm-theme');if(t==='iris'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className={`${inter.className} min-h-full`}>{children}</body>
    </html>
  )
}
