/**
 * LinguaBridge — Hono application entry (Cloudflare Pages / Workers)
 *
 * Route map
 *   Pages:  /  /login  /register  /dashboard  /meetings  /meetings/new  /meetings/:id  /rooms  /contacts  /settings
 *           /join/:token  /room/:slug
 *   API:    /api/auth/*  /api/meetings/*  /api/join/:token  /api/participants/:slug/me  /api/contacts/*
 *           /api/settings/*  /api/dashboard  /api/health
 *           /api/rt/:slug/*  (realtime: LiveKit token, STT token, transcripts → translations, TTS, moderation)
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import type { AppEnv } from './types'
import { renderer } from './renderer'
import { sessionMiddleware } from './lib/auth'
import { ValidationError } from './lib/validation'

import authRoutes from './routes/auth'
import meetingRoutes from './routes/meetings'
import joinRoutes, { participants as participantRoutes } from './routes/join'
import contactRoutes from './routes/contacts'
import settingsRoutes from './routes/settings'
import dashboardRoutes from './routes/dashboard'
import realtimeRoutes from './routes/realtime'

import publicPages from './pages/public'
import appPages from './pages/app'
import joinPages from './pages/join'

const app = new Hono<AppEnv>()

// ---- Global middleware -----------------------------------------------------
app.use('*', logger())
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net', 'https://cdn.tailwindcss.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'data:'],
      workerSrc: ["'self'", 'blob:'],
      frameAncestors: ["'none'"]
    },
    crossOriginEmbedderPolicy: false
  })
)
app.use('/api/*', cors({ origin: (origin, c) => origin === new URL(c.req.url).origin ? origin : '', credentials: true }))
app.use('*', sessionMiddleware)
app.use(renderer)

// ---- API -------------------------------------------------------------------
app.get('/api/health', (c) =>
  c.json({ ok: true, app: 'LinguaBridge', phase: 1, time: new Date().toISOString(), db: !!c.env.DB })
)
app.route('/api/auth', authRoutes)
app.route('/api/meetings', meetingRoutes)
app.route('/api/join', joinRoutes)
app.route('/api/participants', participantRoutes)
app.route('/api/contacts', contactRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/dashboard', dashboardRoutes)
app.route('/api/rt', realtimeRoutes)

// ---- Pages -----------------------------------------------------------------
app.route('/', publicPages)
app.route('/', joinPages)
app.route('/', appPages)

// ---- Errors ----------------------------------------------------------------
app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404)
  c.status(404)
  return c.render(
    <div class="lb-auth-wrap"><div class="lb-card lb-auth-card text-center">
      <div class="text-5xl font-extrabold text-white mb-2">404</div>
      <p class="text-slate-400 mb-6">The page you are looking for does not exist.</p>
      <a href="/" class="lb-btn lb-btn-primary">Back home</a>
    </div></div>,
    { title: 'Not found', layout: 'public', user: c.var.user }
  )
})

app.onError((err, c) => {
  if (err instanceof ValidationError) return c.json({ error: err.message, field: err.field }, 400)
  const msg = err instanceof Error ? err.message : String(err)
  if (/UNIQUE constraint failed/i.test(msg)) return c.json({ error: 'A record with these details already exists' }, 409)
  console.error('[LinguaBridge] Unhandled error:', err)
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Internal server error' }, 500)
  return c.text('Internal server error', 500)
})

export default app
