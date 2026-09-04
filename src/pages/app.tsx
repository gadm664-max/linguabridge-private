import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAuthPage } from '../lib/auth'
import { LANGUAGES } from '../lib/languages'
import { COUNTRIES } from '../lib/countries'
import { getMeeting } from '../services/meetings'

const app = new Hono<AppEnv>()
// Guard only the authenticated app paths (a catch-all would turn unknown URLs into redirects instead of 404s).
for (const p of ['/dashboard', '/meetings', '/meetings/*', '/rooms', '/contacts', '/settings']) app.use(p, requireAuthPage)

const PageHead = ({ title, sub, actions }: { title: string; sub?: string; actions?: any }) => (
  <div class="flex flex-wrap items-end justify-between gap-3 mb-6">
    <div>
      <h1 class="lb-page-title">{title}</h1>
      {sub && <p class="lb-page-sub">{sub}</p>}
    </div>
    {actions && <div class="flex gap-2">{actions}</div>}
  </div>
)

/** Shared language/country selector block used by Create Meeting and Settings. */
export const LanguageSelectors = ({ prefix = '', showCountry = true, showMode = true, showAuto = true }: { prefix?: string; showCountry?: boolean; showMode?: boolean; showAuto?: boolean }) => (
  <>
    {showCountry && (
      <div>
        <label class="lb-label" for={`${prefix}country_search`}>Country</label>
        <div class="lb-combo" data-combo="country">
          <input class="lb-input" id={`${prefix}country_search`} placeholder="Search country…" autocomplete="off" />
          <input type="hidden" name="country_code" id={`${prefix}country_code`} />
          <div class="lb-combo-list" role="listbox"></div>
        </div>
        <p class="lb-hint">Country is stored separately from your languages — it only pre-fills a suggestion.</p>
      </div>
    )}
    <div class="grid sm:grid-cols-2 gap-4">
      <div>
        <label class="lb-label" for={`${prefix}spoken_language`}>Primary spoken language</label>
        <select class="lb-select" id={`${prefix}spoken_language`} name="spoken_language">
          {LANGUAGES.map((l) => <option value={l.code}>{l.name} · {l.nativeName}</option>)}
        </select>
      </div>
      <div>
        <label class="lb-label" for={`${prefix}translation_language`}>Receive translation in</label>
        <select class="lb-select" id={`${prefix}translation_language`} name="translation_language">
          {LANGUAGES.map((l) => <option value={l.code}>{l.name} · {l.nativeName}</option>)}
        </select>
      </div>
    </div>
    {showAuto && (
      <label class="lb-toggle">
        <span><span class="lb-toggle-label">Auto-detect spoken language</span><span class="lb-toggle-desc block">If you start speaking another language, translation follows what you actually say.</span></span>
        <input type="checkbox" name="auto_detect_language" id={`${prefix}auto_detect_language`} checked /><span class="lb-switch"></span>
      </label>
    )}
    {showMode && (
      <div>
        <span class="lb-label">Translation output</span>
        <div class="lb-seg" data-seg="translation_mode">
          {[
            ['text', 'Text only', 'Live captions'],
            ['text_voice', 'Text + Voice', 'Captions and translated audio'],
            ['voice', 'Voice only', 'Translated audio only']
          ].map(([v, t, d], i) => (
            <>
              <input type="radio" name="translation_mode" id={`${prefix}mode_${v}`} value={v} checked={i === 0} />
              <label for={`${prefix}mode_${v}`}><span class="t">{t}</span><span class="d">{d}</span></label>
            </>
          ))}
        </div>
      </div>
    )}
  </>
)

// ---- Dashboard -------------------------------------------------------------
app.get('/dashboard', (c) => {
  const u = c.var.user!
  return c.render(
    <div data-page="dashboard">
      <PageHead title={`Good day, ${u.name.split(' ')[0]}`} sub="Here is what is happening across your rooms." actions={<a href="/meetings/new" class="lb-btn lb-btn-primary"><i class="fas fa-plus"></i> Create meeting</a>} />
      <section class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="stats" aria-label="Key metrics">
        {[['total', 'Total meetings', 'fa-video'], ['active', 'Active now', 'fa-signal'], ['private_rooms', 'Client rooms', 'fa-door-closed'], ['minutes', 'Minutes hosted', 'fa-clock']].map(([k, l, i]) => (
          <div class="lb-card lb-stat"><div class="flex items-center justify-between"><span class="lb-stat-label">{l}</span><i class={`fas ${i} text-slate-500`}></i></div><div class="lb-stat-value" data-stat={k}>–</div></div>
        ))}
      </section>
      <div class="grid lg:grid-cols-3 gap-4">
        <section class="lb-card lb-card-pad lg:col-span-2">
          <div class="flex items-center justify-between mb-3"><h2 class="lb-card-title"><i class="fas fa-clock-rotate-left text-cyan-300"></i> Recent meetings</h2><a href="/meetings" class="text-sm text-cyan-300">View all</a></div>
          <div id="recent-meetings"><div class="lb-skeleton h-24"></div></div>
        </section>
        <section class="lb-card lb-card-pad">
          <h2 class="lb-card-title mb-3"><i class="fas fa-signal text-emerald-300"></i> Active rooms</h2>
          <div id="active-rooms"><div class="lb-skeleton h-24"></div></div>
        </section>
        <section class="lb-card lb-card-pad">
          <div class="flex items-center justify-between mb-3"><h2 class="lb-card-title"><i class="fas fa-door-closed text-violet-300"></i> Recent clients</h2><a href="/rooms" class="text-sm text-cyan-300">Rooms</a></div>
          <div id="recent-clients"><div class="lb-skeleton h-24"></div></div>
        </section>
        <section class="lb-card lb-card-pad">
          <h2 class="lb-card-title mb-3"><i class="fas fa-language text-cyan-300"></i> Language usage</h2>
          <div id="language-usage"><div class="lb-skeleton h-24"></div></div>
        </section>
        <section class="lb-card lb-card-pad">
          <h2 class="lb-card-title mb-3"><i class="fas fa-users text-amber-300"></i> Recent participants</h2>
          <div id="recent-participants"><div class="lb-skeleton h-24"></div></div>
        </section>
      </div>
    </div>,
    { title: 'Dashboard', layout: 'app', user: u, active: 'dashboard' }
  )
})

// ---- Meetings list ---------------------------------------------------------
app.get('/meetings', (c) => {
  const filter = c.req.query('filter') || 'all'
  const titles: Record<string, [string, string, string]> = {
    all: ['My Meetings', 'Every meeting and room you host.', 'meetings'],
    upcoming: ['Upcoming Meetings', 'Scheduled meetings that have not started yet.', 'upcoming'],
    history: ['Meeting History', 'Ended meetings with participant and language records.', 'history']
  }
  const [title, sub, active] = titles[filter] || titles.all
  return c.render(
    <div data-page="meetings" data-filter={filter}>
      <PageHead title={title} sub={sub} actions={<a href="/meetings/new" class="lb-btn lb-btn-primary"><i class="fas fa-plus"></i> Create meeting</a>} />
      <div class="flex gap-2 mb-4" role="tablist">
        {[['all', 'All'], ['upcoming', 'Upcoming'], ['history', 'History']].map(([k, l]) => (
          <a href={`/meetings${k === 'all' ? '' : `?filter=${k}`}`} class={`lb-btn lb-btn-sm ${filter === k ? 'lb-btn-soft' : 'lb-btn-ghost'}`}>{l}</a>
        ))}
      </div>
      <section class="lb-card overflow-hidden" id="meeting-list"><div class="lb-skeleton h-40 m-4"></div></section>
    </div>,
    { title, layout: 'app', user: c.var.user, active }
  )
})

// ---- Create meeting --------------------------------------------------------
app.get('/meetings/new', (c) => {
  const preset = c.req.query('type') === 'private_room' ? 'private_room' : c.req.query('type') === 'scheduled' ? 'scheduled' : 'instant'
  return c.render(
    <div data-page="create-meeting" class="max-w-3xl">
      <PageHead title="Create meeting" sub="Set up a room and get a secure invitation link in seconds." />
      <form id="create-form" class="grid gap-6">
        <section class="lb-card lb-card-pad grid gap-4">
          <div><label class="lb-label" for="name">Meeting name</label><input class="lb-input" id="name" name="name" placeholder="e.g. Q3 Partner Review or Carlos Garcia — Private Room" required minlength={2} /></div>
          <div>
            <span class="lb-label">Meeting type</span>
            <div class="lb-seg" data-seg="type">
              {[
                ['instant', 'Instant meeting', 'Start now, link valid 7 days', 'fa-bolt'],
                ['private_room', 'Private client room', 'Persistent, reusable, per client', 'fa-door-closed'],
                ['scheduled', 'Scheduled meeting', 'Pick a date and time', 'fa-calendar']
              ].map(([v, t, d]) => (
                <>
                  <input type="radio" name="type" id={`type_${v}`} value={v} checked={preset === v} />
                  <label for={`type_${v}`}><span class="t">{t}</span><span class="d">{d}</span></label>
                </>
              ))}
            </div>
          </div>
          <div id="field-client" class={preset === 'private_room' ? '' : 'hidden'}>
            <label class="lb-label" for="client_name">Client name</label>
            <input class="lb-input" id="client_name" name="client_name" placeholder="Carlos Garcia" />
            <div class="mt-3"><label class="lb-label" for="client_contact_id">Link to contact <span class="text-slate-500 font-normal">(optional)</span></label><select class="lb-select" id="client_contact_id" name="client_contact_id"><option value="">— none —</option></select></div>
          </div>
          <div id="field-schedule" class={preset === 'scheduled' ? '' : 'hidden'}>
            <label class="lb-label" for="scheduled_at">Date &amp; time</label>
            <input class="lb-input" id="scheduled_at" name="scheduled_at" type="datetime-local" />
          </div>
        </section>

        <section class="lb-card lb-card-pad grid gap-3">
          <h2 class="lb-card-title mb-1"><i class="fas fa-sliders text-cyan-300"></i> Meeting options</h2>
          {[
            ['video_enabled', 'Enable video', 'Participants can turn on cameras (Phase 5).', true],
            ['translation_enabled', 'Enable live translation', 'Real-time captions and translation for every participant.', true],
            ['allow_language_selection', 'Allow participants to select language', 'If off, everyone receives your host language.', true],
            ['auto_language_detection', 'Enable auto language detection', 'Detect the language actually being spoken.', true],
            ['require_password', 'Require password', 'Participants must enter a password to join.', false]
          ].map(([k, t, d, on]) => (
            <label class="lb-toggle"><span><span class="lb-toggle-label">{t}</span><span class="lb-toggle-desc block">{d}</span></span><input type="checkbox" name={k as string} id={k as string} checked={!!on} /><span class="lb-switch"></span></label>
          ))}
          <div id="field-password" class="hidden"><label class="lb-label" for="password">Meeting password</label><input class="lb-input" id="password" name="password" minlength={4} /></div>
          <div class="grid sm:grid-cols-2 gap-4">
            <div><label class="lb-label" for="max_participants">Maximum participants</label><input class="lb-input" id="max_participants" name="max_participants" type="number" min={2} max={100} value={25} /></div>
            <div><label class="lb-label" for="host_language">Host language</label><select class="lb-select" id="host_language" name="host_language">{LANGUAGES.map((l) => <option value={l.code}>{l.name} · {l.nativeName}</option>)}</select></div>
          </div>
        </section>

        <div id="form-error" class="lb-form-error hidden"></div>
        <div class="flex justify-end gap-2"><a href="/dashboard" class="lb-btn lb-btn-ghost">Cancel</a><button class="lb-btn lb-btn-primary lb-btn-lg" type="submit"><i class="fas fa-link"></i> Create &amp; get invitation link</button></div>
      </form>
    </div>,
    { title: 'Create meeting', layout: 'app', user: c.var.user, active: 'new' }
  )
})

// ---- Meeting details -------------------------------------------------------
app.get('/meetings/:id', async (c) => {
  const m = await getMeeting(c.env, c.req.param('id'))
  if (!m || m.host_user_id !== c.var.user!.id) return c.notFound()
  return c.render(
    <div data-page="meeting-detail" data-id={m.id} data-slug={m.slug}>
      <div class="mb-4"><a href={m.type === 'private_room' ? '/rooms' : '/meetings'} class="text-sm text-slate-400 hover:text-white"><i class="fas fa-arrow-left"></i> Back</a></div>
      <div class="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div class="flex items-center gap-2 mb-1"><span class={`lb-badge lb-badge-${m.type}`}>{m.type.replace('_', ' ')}</span><span class={`lb-badge lb-badge-${m.status}`} id="status-badge">{m.status}</span></div>
          <h1 class="lb-page-title">{m.name}</h1>
          {m.client_name && <p class="lb-page-sub"><i class="fas fa-user"></i> Client: {m.client_name}</p>}
        </div>
        <div class="flex flex-wrap gap-2" id="meeting-actions">
          <a href={`/room/${m.slug}`} class="lb-btn lb-btn-primary" id="enter-room"><i class="fas fa-right-to-bracket"></i> Enter room</a>
          <button class="lb-btn lb-btn-ghost" data-action="end" id="btn-end"><i class="fas fa-stop"></i> End meeting</button>
          <button class="lb-btn lb-btn-danger" data-action="delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="grid lg:grid-cols-3 gap-4">
        <section class="lb-card lb-card-pad lg:col-span-2">
          <div class="flex items-center justify-between mb-3"><h2 class="lb-card-title"><i class="fas fa-link text-cyan-300"></i> Invitation links</h2><button class="lb-btn lb-btn-soft lb-btn-sm" id="btn-new-invite"><i class="fas fa-plus"></i> New link</button></div>
          <div id="invitations"><div class="lb-skeleton h-20"></div></div>
          <form id="invite-form" class="hidden mt-4 grid gap-3 border-t border-slate-700/50 pt-4">
            <div class="grid sm:grid-cols-2 gap-3">
              <div><label class="lb-label">Label</label><input class="lb-input" name="label" placeholder="e.g. Carlos" /></div>
              <div><label class="lb-label">Invite email (optional)</label><input class="lb-input" name="invited_email" type="email" /></div>
              <div><label class="lb-label">Expires in (hours)</label><input class="lb-input" name="expires_in_hours" type="number" min={1} placeholder="Leave empty = default" /></div>
              <div><label class="lb-label">Max uses</label><input class="lb-input" name="max_uses" type="number" min={1} placeholder="Unlimited" /></div>
              <div><label class="lb-label">Link password (optional)</label><input class="lb-input" name="password" minlength={4} /></div>
            </div>
            <div class="flex flex-wrap gap-3">
              <label class="lb-toggle flex-1"><span class="lb-toggle-label">Single-use</span><input type="checkbox" name="single_use" /><span class="lb-switch"></span></label>
              <label class="lb-toggle flex-1"><span class="lb-toggle-label">Persistent (never expires)</span><input type="checkbox" name="is_persistent" checked={m.type === 'private_room'} /><span class="lb-switch"></span></label>
            </div>
            <div class="flex justify-end gap-2"><button type="button" class="lb-btn lb-btn-ghost lb-btn-sm" id="btn-cancel-invite">Cancel</button><button class="lb-btn lb-btn-primary lb-btn-sm" type="submit">Generate link</button></div>
          </form>
        </section>
        <section class="lb-card lb-card-pad">
          <h2 class="lb-card-title mb-3"><i class="fas fa-gear text-slate-300"></i> Room settings</h2>
          <dl class="text-sm grid gap-2" id="meeting-settings">
            {[
              ['Video', m.video_enabled], ['Live translation', m.translation_enabled], ['Participant language choice', m.allow_language_selection], ['Auto language detection', m.auto_language_detection]
            ].map(([l, v]) => <div class="flex justify-between"><dt class="text-slate-400">{l}</dt><dd class={v ? 'text-emerald-300' : 'text-slate-500'}>{v ? 'On' : 'Off'}</dd></div>)}
            <div class="flex justify-between"><dt class="text-slate-400">Password</dt><dd>{m.has_password ? <span class="text-amber-300"><i class="fas fa-lock"></i> Required</span> : <span class="text-slate-500">None</span>}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-400">Max participants</dt><dd>{m.max_participants}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-400">Host language</dt><dd>{LANGUAGES.find((l) => l.code === m.host_language)?.name}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-400">Room locked</dt><dd><button class="text-cyan-300 text-xs" data-action="toggle-lock" data-locked={String(m.is_locked)}>{m.is_locked ? 'Locked — unlock' : 'Open — lock'}</button></dd></div>
            {m.scheduled_at && <div class="flex justify-between"><dt class="text-slate-400">Scheduled</dt><dd data-time={m.scheduled_at}>{m.scheduled_at}</dd></div>}
          </dl>
        </section>
        <section class="lb-card lb-card-pad lg:col-span-3">
          <h2 class="lb-card-title mb-3"><i class="fas fa-users text-amber-300"></i> Participants</h2>
          <div id="participants"><div class="lb-skeleton h-20"></div></div>
        </section>
      </div>
    </div>,
    { title: m.name, layout: 'app', user: c.var.user, active: m.type === 'private_room' ? 'rooms' : 'meetings' }
  )
})

// ---- Private client rooms ------------------------------------------------
app.get('/rooms', (c) =>
  c.render(
    <div data-page="rooms">
      <PageHead title="Private Client Rooms" sub="Persistent rooms with a permanent secure link per client." actions={<a href="/meetings/new?type=private_room" class="lb-btn lb-btn-primary"><i class="fas fa-plus"></i> New client room</a>} />
      <section id="rooms-grid" class="grid md:grid-cols-2 xl:grid-cols-3 gap-4"><div class="lb-skeleton h-40"></div></section>
    </div>,
    { title: 'Private Client Rooms', layout: 'app', user: c.var.user, active: 'rooms' }
  )
)

// ---- Contacts --------------------------------------------------------------
app.get('/contacts', (c) =>
  c.render(
    <div data-page="contacts">
      <PageHead title="Contacts" sub="Clients and partners with their language preferences." actions={<button class="lb-btn lb-btn-primary" id="btn-new-contact"><i class="fas fa-user-plus"></i> Add contact</button>} />
      <div class="grid lg:grid-cols-3 gap-4">
        <section class="lb-card lg:col-span-2 overflow-hidden">
          <div class="p-3 border-b border-slate-700/40"><input class="lb-input" id="contact-search" placeholder="Search contacts…" /></div>
          <div id="contact-list"><div class="lb-skeleton h-32 m-4"></div></div>
        </section>
        <section class="lb-card lb-card-pad" id="contact-editor">
          <h2 class="lb-card-title mb-3" id="contact-editor-title"><i class="fas fa-user-plus text-cyan-300"></i> New contact</h2>
          <form id="contact-form" class="grid gap-3">
            <input type="hidden" name="id" />
            <div><label class="lb-label">Name</label><input class="lb-input" name="name" required /></div>
            <div><label class="lb-label">Email</label><input class="lb-input" name="email" type="email" /></div>
            <div><label class="lb-label">Company</label><input class="lb-input" name="company" /></div>
            <LanguageSelectors prefix="c_" showMode={false} showAuto={false} />
            <div><label class="lb-label">Notes</label><textarea class="lb-textarea" name="notes" rows={2}></textarea></div>
            <div id="form-error" class="lb-form-error hidden"></div>
            <div class="flex gap-2 justify-end"><button type="button" class="lb-btn lb-btn-ghost lb-btn-sm hidden" id="contact-cancel">Cancel</button><button class="lb-btn lb-btn-primary lb-btn-sm" type="submit">Save contact</button></div>
          </form>
        </section>
      </div>
    </div>,
    { title: 'Contacts', layout: 'app', user: c.var.user, active: 'contacts' }
  )
)

// ---- Settings --------------------------------------------------------------
app.get('/settings', (c) =>
  c.render(
    <div data-page="settings" class="max-w-3xl">
      <PageHead title="Settings" sub="Your profile and default language preferences for joining meetings." />
      <form id="settings-form" class="grid gap-6">
        <section class="lb-card lb-card-pad grid gap-4">
          <h2 class="lb-card-title"><i class="fas fa-user text-cyan-300"></i> Profile</h2>
          <div class="grid sm:grid-cols-2 gap-4">
            <div><label class="lb-label">Name</label><input class="lb-input" name="name" value={c.var.user!.name} required minlength={2} /></div>
            <div><label class="lb-label">Company</label><input class="lb-input" name="company" value={c.var.user!.company ?? ''} /></div>
          </div>
          <div><label class="lb-label">Email</label><input class="lb-input" value={c.var.user!.email} disabled /></div>
        </section>
        <section class="lb-card lb-card-pad grid gap-4">
          <h2 class="lb-card-title"><i class="fas fa-language text-violet-300"></i> Default language preferences</h2>
          <LanguageSelectors prefix="s_" />
          <label class="lb-toggle"><span><span class="lb-toggle-label">Show original text</span><span class="lb-toggle-desc block">Display the speaker's original words alongside the translation.</span></span><input type="checkbox" name="show_original_text" checked /><span class="lb-switch"></span></label>
          <div class="grid sm:grid-cols-2 gap-4">
            <div><label class="lb-label">Original speaker volume <span id="v-orig" class="text-cyan-300">100</span>%</label><input type="range" name="original_audio_volume" min={0} max={100} value={100} class="w-full" /></div>
            <div><label class="lb-label">Translated voice volume <span id="v-tr" class="text-cyan-300">100</span>%</label><input type="range" name="translated_audio_volume" min={0} max={100} value={100} class="w-full" /></div>
          </div>
        </section>
        <section class="lb-card lb-card-pad grid gap-3">
          <h2 class="lb-card-title"><i class="fas fa-plug text-amber-300"></i> Service configuration</h2>
          <p class="text-sm text-slate-400">Honest status of external services. Keys are configured server-side only and are never shown here.</p>
          <div id="provider-status" class="grid sm:grid-cols-2 gap-2"><div class="lb-skeleton h-16"></div></div>
        </section>
        <section class="lb-card lb-card-pad grid gap-3">
          <h2 class="lb-card-title"><i class="fas fa-key text-slate-300"></i> Change password</h2>
          <div class="grid sm:grid-cols-2 gap-4">
            <div><label class="lb-label">Current password</label><input class="lb-input" id="current_password" type="password" autocomplete="current-password" /></div>
            <div><label class="lb-label">New password</label><input class="lb-input" id="new_password" type="password" autocomplete="new-password" minlength={8} /></div>
          </div>
          <div><button type="button" class="lb-btn lb-btn-ghost lb-btn-sm" id="btn-change-password">Update password</button></div>
        </section>
        <div id="form-error" class="lb-form-error hidden"></div>
        <div class="flex justify-end"><button class="lb-btn lb-btn-primary" type="submit"><i class="fas fa-check"></i> Save settings</button></div>
      </form>
    </div>,
    { title: 'Settings', layout: 'app', user: c.var.user, active: 'settings' }
  )
)

export default app
export { COUNTRIES }
