import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { Logo } from '../renderer'

const pages = new Hono<AppEnv>()

pages.get('/', (c) => {
  return c.render(
    <>
      <section class="lb-hero" id="hero-section">
        <div class="lb-container">
          <span class="lb-eyebrow"><i class="fas fa-wand-magic-sparkles"></i> AI real-time multilingual meetings</span>
          <h1>Speak Naturally.<br /><span>Understand Everyone.</span></h1>
          <p>Private meeting rooms where every participant hears and reads the conversation in their own language — live, as it happens.</p>
          <div class="flex flex-wrap items-center justify-center gap-3">
            <a href="/register" class="lb-btn lb-btn-primary lb-btn-lg"><i class="fas fa-rocket"></i> Create your first room</a>
            <a href="/login" class="lb-btn lb-btn-ghost lb-btn-lg">Sign in</a>
          </div>
          <div class="lb-caption-demo" aria-label="Live caption example">
            <div class="lb-caption">
              <span class="lb-avatar">M</span>
              <div>
                <div class="who">Mohamed · Arabic <span class="lb-pill ml-2"><span class="lb-dot lb-dot-green lb-pulse"></span> speaking</span></div>
                <div class="orig" dir="rtl" lang="ar">مرحبا، يسعدني أن نبدأ هذا الاجتماع اليوم.</div>
                <div class="tr">Hello, I am pleased to begin this meeting today.</div>
              </div>
            </div>
            <div class="lb-caption">
              <span class="lb-avatar" style="background:linear-gradient(135deg,#f472b6,#a78bfa)">C</span>
              <div>
                <div class="who">Carlos · Spanish</div>
                <div class="orig" lang="es">Perfecto, empecemos con el resumen del proyecto.</div>
                <div class="tr">Perfect, let's start with the project summary.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="lb-container" id="features-section">
        <div class="grid md:grid-cols-3 gap-4">
          {[
            ['fa-door-closed', 'Private client rooms', 'Persistent, password-protected rooms per client. Reuse the same secure link for every meeting.'],
            ['fa-language', 'Personal translation', 'Country and language are stored separately. Speak Spanish, receive Arabic — your choice, per participant.'],
            ['fa-bolt', 'One translation per language', 'Translation groups mean one Arabic sentence is translated once per target language, then delivered to everyone.'],
            ['fa-closed-captioning', 'Live captions', 'Streaming partial and final transcripts with the original text toggle.'],
            ['fa-volume-high', 'Translated voice', 'Text, text + voice, or voice only — with independent volume for original and translated audio.'],
            ['fa-shield-halved', 'Secure by default', 'Unique invitation tokens, expiry, single-use links, server-side API keys, no audio recording unless enabled.']
          ].map(([icon, title, desc]) => (
            <article class="lb-card lb-feature">
              <i class={`fas ${icon}`}></i>
              <h3>{title}</h3>
              <p>{desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section class="lb-container mt-16 text-center" id="languages-section">
        <p class="text-slate-400 text-sm uppercase tracking-widest mb-4">Launch languages</p>
        <div class="flex flex-wrap justify-center gap-2">
          {['العربية', 'English', 'Español', 'Français', 'Italiano', 'Português', 'Deutsch'].map((l) => <span class="lb-pill">{l}</span>)}
        </div>
      </section>
    </>,
    { title: 'Speak Naturally. Understand Everyone.', layout: 'public', user: c.var.user }
  )
})

const AuthShell = ({ title, sub, children }: { title: string; sub: string; children: any }) => (
  <div class="lb-auth-wrap">
    <div class="lb-card lb-auth-card">
      <div class="mb-6 text-center">
        <div class="flex justify-center mb-4"><Logo size="lg" /></div>
        <h1 class="text-xl font-bold text-white">{title}</h1>
        <p class="text-sm text-slate-400 mt-1">{sub}</p>
      </div>
      {children}
    </div>
  </div>
)

pages.get('/login', (c) => {
  if (c.var.user) return c.redirect('/dashboard')
  return c.render(
    <AuthShell title="Welcome back" sub="Sign in to your LinguaBridge workspace">
      <form id="login-form" class="grid gap-4" data-next={c.req.query('next') || '/dashboard'}>
        <div id="form-error" class="lb-form-error hidden"></div>
        <div><label class="lb-label" for="email">Email</label><input class="lb-input" id="email" name="email" type="email" autocomplete="email" required /></div>
        <div><label class="lb-label" for="password">Password</label><input class="lb-input" id="password" name="password" type="password" autocomplete="current-password" required /></div>
        <button class="lb-btn lb-btn-primary w-full" type="submit">Sign in</button>
        <p class="text-center text-sm text-slate-400">No account? <a href="/register" class="text-cyan-300 font-semibold">Create one</a></p>
      </form>
    </AuthShell>,
    { title: 'Sign in', layout: 'public', user: null }
  )
})

pages.get('/register', (c) => {
  if (c.var.user) return c.redirect('/dashboard')
  return c.render(
    <AuthShell title="Create your workspace" sub="Host multilingual meetings in minutes">
      <form id="register-form" class="grid gap-4">
        <div id="form-error" class="lb-form-error hidden"></div>
        <div><label class="lb-label" for="name">Full name</label><input class="lb-input" id="name" name="name" autocomplete="name" required minlength={2} /></div>
        <div><label class="lb-label" for="company">Company <span class="text-slate-500 font-normal">(optional)</span></label><input class="lb-input" id="company" name="company" autocomplete="organization" /></div>
        <div><label class="lb-label" for="email">Work email</label><input class="lb-input" id="email" name="email" type="email" autocomplete="email" required /></div>
        <div><label class="lb-label" for="password">Password</label><input class="lb-input" id="password" name="password" type="password" autocomplete="new-password" required minlength={8} /><p class="lb-hint">At least 8 characters.</p></div>
        <button class="lb-btn lb-btn-primary w-full" type="submit">Create account</button>
        <p class="text-center text-sm text-slate-400">Already have an account? <a href="/login" class="text-cyan-300 font-semibold">Sign in</a></p>
      </form>
    </AuthShell>,
    { title: 'Create account', layout: 'public', user: null }
  )
})

export default pages
