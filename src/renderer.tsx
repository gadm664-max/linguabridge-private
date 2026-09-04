import { jsxRenderer } from 'hono/jsx-renderer'
import type { AuthUser } from './types'

declare module 'hono' {
  interface ContextRenderer {
    (content: string | Promise<string>, props?: { title?: string; layout?: 'public' | 'app' | 'bare'; user?: AuthUser | null; active?: string }): Response
  }
}

export const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => (
  <a href="/" class={`lb-logo lb-logo-${size}`} aria-label="LinguaBridge home">
    <span class="lb-logo-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M4 22c4-10 8-14 12-14s8 4 12 14" stroke="url(#g)" stroke-width="3" stroke-linecap="round" />
        <circle cx="4" cy="22" r="3" fill="#22d3ee" />
        <circle cx="28" cy="22" r="3" fill="#a78bfa" />
        <circle cx="16" cy="9" r="2.5" fill="#fff" />
        <defs><linearGradient id="g" x1="4" y1="22" x2="28" y2="22"><stop stop-color="#22d3ee" /><stop offset="1" stop-color="#a78bfa" /></linearGradient></defs>
      </svg>
    </span>
    <span class="lb-logo-text">Lingua<b>Bridge</b></span>
  </a>
)

const NAV = [
  { href: '/dashboard', icon: 'fa-grid-2', label: 'Dashboard', key: 'dashboard' },
  { href: '/meetings', icon: 'fa-video', label: 'My Meetings', key: 'meetings' },
  { href: '/rooms', icon: 'fa-door-closed', label: 'Private Client Rooms', key: 'rooms' },
  { href: '/meetings/new', icon: 'fa-plus', label: 'Create Meeting', key: 'new' },
  { href: '/meetings?filter=upcoming', icon: 'fa-calendar', label: 'Upcoming Meetings', key: 'upcoming' },
  { href: '/meetings?filter=history', icon: 'fa-clock-rotate-left', label: 'Meeting History', key: 'history' },
  { href: '/contacts', icon: 'fa-address-book', label: 'Contacts', key: 'contacts' },
  { href: '/settings', icon: 'fa-gear', label: 'Settings', key: 'settings' }
]

export const renderer = jsxRenderer(({ children, title, layout = 'public', user, active }) => {
  const pageTitle = title ? `${title} · LinguaBridge` : 'LinguaBridge — Speak Naturally. Understand Everyone.'
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{pageTitle}</title>
        <meta name="description" content="LinguaBridge — AI real-time multilingual meeting platform. One meeting. Every language." />
        <link rel="icon" href="/static/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Arabic:wght@400;600&display=swap" rel="stylesheet" />
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/css/all.min.css" rel="stylesheet" />
        <link href="/static/style.css" rel="stylesheet" />
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/plugin/relativeTime.js"></script>
      </head>
      <body class={`lb-body lb-layout-${layout}`}>
        {layout === 'app' ? (
          <div class="lb-app">
            <aside class="lb-sidebar" id="sidebar">
              <div class="lb-sidebar-head">
                <Logo size="sm" />
                <button class="lb-icon-btn lg:hidden" id="sidebar-close" aria-label="Close menu"><i class="fas fa-xmark"></i></button>
              </div>
              <nav class="lb-nav" aria-label="Main navigation">
                {NAV.map((n) => (
                  <a href={n.href} class={`lb-nav-item ${active === n.key ? 'is-active' : ''}`}>
                    <i class={`fas ${n.icon}`}></i><span>{n.label}</span>
                  </a>
                ))}
              </nav>
              <div class="lb-sidebar-foot">
                <div class="lb-user-chip">
                  <span class="lb-avatar">{(user?.name || '?').slice(0, 1).toUpperCase()}</span>
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-white">{user?.name}</div>
                    <div class="truncate text-xs text-slate-400">{user?.company || user?.email}</div>
                  </div>
                </div>
                <button class="lb-nav-item w-full" id="logout-btn"><i class="fas fa-arrow-right-from-bracket"></i><span>Sign out</span></button>
              </div>
            </aside>
            <div class="lb-main">
              <header class="lb-topbar">
                <button class="lb-icon-btn lg:hidden" id="sidebar-open" aria-label="Open menu"><i class="fas fa-bars"></i></button>
                <div class="flex-1"></div>
                <a href="/meetings/new" class="lb-btn lb-btn-primary lb-btn-sm"><i class="fas fa-plus"></i> New meeting</a>
              </header>
              <main class="lb-content" id="main-content">{children}</main>
            </div>
          </div>
        ) : layout === 'bare' ? (
          <main id="main-content">{children}</main>
        ) : (
          <>
            <header class="lb-public-header">
              <div class="lb-container flex items-center justify-between">
                <Logo />
                <nav class="flex items-center gap-2" aria-label="Public navigation">
                  {user ? (
                    <a href="/dashboard" class="lb-btn lb-btn-primary lb-btn-sm">Go to dashboard <i class="fas fa-arrow-right"></i></a>
                  ) : (
                    <>
                      <a href="/login" class="lb-btn lb-btn-ghost lb-btn-sm">Sign in</a>
                      <a href="/register" class="lb-btn lb-btn-primary lb-btn-sm">Get started</a>
                    </>
                  )}
                </nav>
              </div>
            </header>
            <main id="main-content">{children}</main>
            <footer class="lb-public-footer">
              <div class="lb-container flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-slate-400">
                <span>© 2026 LinguaBridge · Speak Naturally. Understand Everyone.</span>
                <span>Arabic · English · Spanish · French · Italian · Portuguese · German</span>
              </div>
            </footer>
          </>
        )}
        <div id="toast-root" class="lb-toast-root" aria-live="polite"></div>
        <script src="/static/app.js"></script>
      </body>
    </html>
  )
})
