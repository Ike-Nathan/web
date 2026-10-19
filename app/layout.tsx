import type { Metadata, Viewport } from 'next'
import './globals.css'
import Link from 'next/link'
import FreighterConnect from '@/components/FreighterConnect'
import WalletStatusBadge from '@/components/WalletStatusBadge'
import MobileNav from '@/components/MobileNav'
import NavLink from '@/components/NavLink'
import AlertPruner from '@/components/AlertPruner'
import StorageBootstrap from '@/components/StorageBootstrap'
import NotificationNavigationRegistrar from '@/components/NotificationNavigationRegistrar'
import AuthRequiredPrompt from '@/components/AuthRequiredPrompt'
import SyncRetryRunner from '@/components/SyncRetryRunner'
import { ToastProvider } from '@/components/ToastProvider'
import { links } from '@/lib/links'

export const metadata: Metadata = {
  title: {
    default: 'TxWatch — Soroban Contract Monitoring',
    template: '%s — TxWatch',
  },
  description: 'Real-time monitoring and alerts for Soroban smart contracts',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <ToastProvider>
          <StorageBootstrap />
          <NotificationNavigationRegistrar />
          <AuthRequiredPrompt />
          <SyncRetryRunner />
          <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
              <Link
                href="/"
                className="flex items-center gap-2 font-bold text-lg tracking-tight"
              >
                <span className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-black">
                  TX
                </span>
                <span className="text-zinc-100">TxWatch</span>
              </Link>

              <nav className="hidden sm:flex items-center gap-6 text-sm">
                <NavLink href="/dashboard" exact>
                  Dashboard
                </NavLink>
                <NavLink href="/contracts">Contracts</NavLink>
                <NavLink href="/settings" exact>
                  Settings
                </NavLink>
                <a
                  href={links.org}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  GitHub
                </a>
              </nav>

              <div className="hidden sm:flex items-center gap-3">
                <WalletStatusBadge />
                <FreighterConnect />
              </div>
              <MobileNav />
            </div>
          </header>

          <AlertPruner />
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  )
}
