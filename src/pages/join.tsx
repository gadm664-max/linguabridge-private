import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import type { AppEnv, ParticipantRow } from '../types'
import { Logo } from '../renderer'
import { LANGUAGES, getLanguage } from '../lib/languages'
import { getCountry } from '../lib/countries'
import { checkInvitation, INVITATION_ERROR_MESSAGES, getMeetingBySlug } from '../services/meetings'
import { PARTICIPANT_COOKIE } from '../routes/join'
import { one } from '../lib/db'

const join = new Hono<AppEnv>()

// ---- /join/:token — pre-join language setup --------------------------------
join.get('/join/:token', async (c) => {
  const check = await checkInvitation(c.env, c.req.param('token'))
  if (!check.ok) {
    return c.render(
      <div class="lb-join-wrap">
        <div class="lb-card lb-join-card text-center">
          <div class="flex justify-center mb-5"><Logo /></div>
          <i class="fas fa-link-slash text-4xl text-slate-500 mb-4"></i>
          <h1 class="text-xl font-bold text-white mb-2">Unable to join</h1>
          <p class="text-slate-400">{INVITATION_ERROR_MESSAGES[check.reason]}</p>
          <a href="/" class="lb-btn lb-btn-ghost mt-6">Back to LinguaBridge</a>
        </div>
      </div>,
      { title: 'Invitation unavailable', layout: 'bare' }
    )
  }
  const { meeting, invitation } = check
  const host = await one<{ name: string; company: string | null }>(c.env.DB, 'SELECT name, company FROM users WHERE id = ?', meeting.host_user_id)
  const requiresPassword = !!(meeting.password_hash || invitation.password_hash)
  const isHost = !!c.var.user && c.var.user.id === meeting.host_user_id

  return c.render(
    <div class="lb-join-wrap" data-page="join" data-token={invitation.token}>
      <div class="lb-card lb-join-card">
        <div class="flex items-center justify-between mb-6">
          <Logo size="sm" />
          <span class="lb-pill"><span class={`lb-dot ${meeting.status === 'active' ? 'lb-dot-green lb-pulse' : 'lb-dot-amber'}`}></span> {meeting.status === 'active' ? 'Live' : meeting.status}</span>
        </div>
        <p class="text-xs uppercase tracking-widest text-slate-400 mb-1">{meeting.type === 'private_room' ? 'Private client room' : meeting.type === 'scheduled' ? 'Scheduled meeting' : 'Meeting invitation'}</p>
        <h1 class="text-2xl font-bold text-white">{meeting.name}</h1>
        <p class="text-slate-400 text-sm mt-1">Hosted by <b class="text-slate-200">{host?.name}</b>{host?.company ? ` · ${host.company}` : ''}{meeting.scheduled_at ? <span> · <span data-time={meeting.scheduled_at}>{meeting.scheduled_at}</span></span> : ''}</p>

        <form id="join-form" class="mt-2" data-allow-lang={String(!!meeting.allow_language_selection || isHost)} data-auto={String(!!meeting.auto_language_detection)} data-host-lang={meeting.host_language}>
          <div class="lb-step"><b>1</b> Who are you</div>
          <div><label class="lb-label" for="display_name">Display name</label><input class="lb-input" id="display_name" name="display_name" placeholder="Mohamed" required maxlength={60} autocomplete="name" /></div>
          {requiresPassword && !isHost && (
            <div class="mt-4"><label class="lb-label" for="password"><i class="fas fa-lock text-amber-300"></i> Meeting password</label><input class="lb-input" id="password" name="password" type="password" required /></div>
          )}

          <div class="lb-step"><b>2</b> Where are you</div>
          <div>
            <label class="lb-label" for="country_search">Country</label>
            <div class="lb-combo" data-combo="country">
              <input class="lb-input" id="country_search" placeholder="Search country…" autocomplete="off" />
              <input type="hidden" name="country_code" id="country_code" />
              <div class="lb-combo-list" role="listbox"></div>
            </div>
            <p class="lb-hint">Your country only suggests a language — you can speak and receive any language you like.</p>
          </div>

          <div class="lb-step"><b>3</b> Your languages</div>
          <div class="grid sm:grid-cols-2 gap-4">
            <div>
              <label class="lb-label" for="spoken_language">I will speak</label>
              <select class="lb-select" id="spoken_language" name="spoken_language">{LANGUAGES.map((l) => <option value={l.code}>{l.name} · {l.nativeName}</option>)}</select>
            </div>
            <div>
              <label class="lb-label" for="translation_language">I want to receive translation in</label>
              <select class="lb-select" id="translation_language" name="translation_language" disabled={!meeting.allow_language_selection && !isHost}>{LANGUAGES.map((l) => <option value={l.code}>{l.name} · {l.nativeName}</option>)}</select>
              {!meeting.allow_language_selection && !isHost && <p class="lb-hint">The host has fixed the translation language to {getLanguage(meeting.host_language)?.name}.</p>}
            </div>
          </div>
          {meeting.auto_language_detection ? (
            <label class="lb-toggle mt-4">
              <span><span class="lb-toggle-label">Auto-detect spoken language</span><span class="lb-toggle-desc block">If you switch to another language mid-meeting, translation follows what you actually say.</span></span>
              <input type="checkbox" name="auto_detect_language" id="auto_detect_language" checked /><span class="lb-switch"></span>
            </label>
          ) : (
            <div class="lb-notice lb-notice-info mt-4"><i class="fas fa-circle-info"></i> Auto language detection is disabled for this meeting.</div>
          )}

          <div class="lb-step"><b>4</b> Translation output</div>
          <div class="lb-seg" data-seg="translation_mode">
            {[
              ['text', 'Text only', 'Live captions', 'fa-closed-captioning'],
              ['text_voice', 'Text + Voice', 'Captions + translated audio', 'fa-headphones'],
              ['voice', 'Voice only', 'Translated audio only', 'fa-volume-high']
            ].map(([v, t, d], i) => (
              <>
                <input type="radio" name="translation_mode" id={`mode_${v}`} value={v} checked={i === 0} />
                <label for={`mode_${v}`}><span class="t">{t}</span><span class="d">{d}</span></label>
              </>
            ))}
          </div>
          <p class="lb-hint">Translated voice becomes available once the speech service is configured for this workspace; your preference is saved either way.</p>

          <div id="form-error" class="lb-form-error hidden mt-4"></div>
          <button class="lb-btn lb-btn-primary lb-btn-lg w-full mt-6" type="submit"><i class="fas fa-right-to-bracket"></i> Join meeting</button>
          <p class="text-center text-xs text-slate-500 mt-3">By joining you agree that your speech may be transcribed and translated for other participants. Audio is not recorded.</p>
        </form>
      </div>
    </div>,
    { title: `Join ${meeting.name}`, layout: 'bare' }
  )
})

// ---- /room/:slug — live room (LiveKit media · Deepgram captions · translated captions/voice) ----
join.get('/room/:slug', async (c) => {
  const meeting = await getMeetingBySlug(c.env, c.req.param('slug'))
  if (!meeting) return c.notFound()
  const token = getCookie(c, PARTICIPANT_COOKIE)
  const me = token ? await one<ParticipantRow>(c.env.DB, `SELECT * FROM meeting_participants WHERE participant_token = ? AND meeting_id = ? AND status = 'joined'`, token, meeting.id) : null
  const isHost = !!c.var.user && c.var.user.id === meeting.host_user_id

  if (!me) {
    // Not yet joined via a link. Hosts get sent through the pre-join with their primary invitation.
    if (isHost) {
      const inv = await one<{ token: string }>(c.env.DB, 'SELECT token FROM meeting_invitations WHERE meeting_id = ? AND is_active = 1 ORDER BY is_persistent DESC, created_at ASC LIMIT 1', meeting.id)
      if (inv) return c.redirect(`/join/${inv.token}`)
    }
    return c.render(
      <div class="lb-join-wrap"><div class="lb-card lb-join-card text-center">
        <div class="flex justify-center mb-5"><Logo /></div>
        <i class="fas fa-lock text-4xl text-slate-500 mb-4"></i>
        <h1 class="text-xl font-bold text-white mb-2">Invitation required</h1>
        <p class="text-slate-400">Ask the host for an invitation link to join <b class="text-slate-200">{meeting.name}</b>.</p>
      </div></div>,
      { title: 'Invitation required', layout: 'bare' }
    )
  }

  const country = getCountry(me.country_code)
  const meJson = JSON.stringify({
    id: me.id, display_name: me.display_name, role: me.role, country_code: me.country_code, spoken_language: me.spoken_language,
    translation_language: me.translation_language, auto_detect_language: !!me.auto_detect_language, translation_mode: me.translation_mode,
    show_original_text: !!me.show_original_text, original_audio_volume: me.original_audio_volume, translated_audio_volume: me.translated_audio_volume
  })
  return c.render(
    <div class="lb-room" data-page="room" data-slug={meeting.slug} data-meeting-id={meeting.id} data-role={me.role} data-video={meeting.video_enabled ? '1' : '0'} data-translation={meeting.translation_enabled ? '1' : '0'}>
      <script id="me-json" type="application/json" dangerouslySetInnerHTML={{ __html: meJson.replace(/</g, '\\u003c') }}></script>
      <header class="lb-room-top">
        <Logo size="sm" />
        <div class="h-6 w-px bg-slate-700"></div>
        <div class="min-w-0"><div class="font-semibold text-white truncate">{meeting.name}</div><div class="text-xs text-slate-400">{meeting.type === 'private_room' ? 'Private client room' : 'Meeting'}{meeting.client_name ? ` · ${meeting.client_name}` : ''}</div></div>
        <div class="flex-1"></div>
        <span class="lb-pill hidden" id="rec-timer"><span class="lb-dot lb-dot-red"></span> <span data-timer>00:00</span></span>
        <span class="lb-pill" id="conn-status"><span class="lb-dot lb-dot-amber"></span> <span>Connecting…</span></span>
        <span class="lb-pill" id="participant-count" title="Participants"><i class="fas fa-users"></i> <b>1</b></span>
        <button class="lb-icon-btn lg:hidden" id="btn-panel" aria-label="Toggle side panel"><i class="fas fa-sidebar fa-table-columns"></i></button>
        <button class="lb-icon-btn" id="btn-settings" aria-label="Translation settings"><i class="fas fa-gear"></i></button>
      </header>

      <div class="lb-room-body">
        <section class="lb-room-stage" id="stage">
          <div class="lb-notice lb-notice-warn hidden" id="media-notice"><i class="fas fa-triangle-exclamation mt-0.5"></i><span id="media-notice-text"></span></div>
          <div class="lb-grid" id="media-grid"></div>
          <div class="lb-captions" id="captions" aria-live="polite"></div>
        </section>

        <aside class="lb-room-panel" id="side-panel">
          <div class="lb-card lb-card-pad">
            <h3 class="lb-card-title mb-3"><i class="fas fa-language text-cyan-300"></i> Your translation</h3>
            <dl class="text-sm grid gap-2" id="my-prefs">
              <div class="flex justify-between"><dt class="text-slate-400">Country</dt><dd>{country ? `${country.flag} ${country.name}` : '—'}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-400">Speaking</dt><dd data-k="spoken_language">{getLanguage(me.spoken_language)?.name}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-400">Receiving</dt><dd data-k="translation_language">{getLanguage(me.translation_language)?.name}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-400">Auto-detect</dt><dd data-k="auto_detect_language">{me.auto_detect_language ? 'On' : 'Off'}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-400">Output</dt><dd data-k="translation_mode">{me.translation_mode.replace('_', ' + ')}</dd></div>
            </dl>
            <form id="prefs-form" class="hidden mt-4 grid gap-3 border-t border-slate-700/50 pt-4">
              <div><label class="lb-label">I speak</label><select class="lb-select" name="spoken_language">{LANGUAGES.map((l) => <option value={l.code} selected={l.code === me.spoken_language}>{l.name}</option>)}</select></div>
              <div><label class="lb-label">Receive in</label><select class="lb-select" name="translation_language">{LANGUAGES.map((l) => <option value={l.code} selected={l.code === me.translation_language}>{l.name}</option>)}</select></div>
              <label class="lb-toggle"><span class="lb-toggle-label">Auto-detect</span><input type="checkbox" name="auto_detect_language" checked={!!me.auto_detect_language} /><span class="lb-switch"></span></label>
              <label class="lb-toggle"><span class="lb-toggle-label">Show original text</span><input type="checkbox" name="show_original_text" checked={!!me.show_original_text} /><span class="lb-switch"></span></label>
              <div><label class="lb-label">Output</label><select class="lb-select" name="translation_mode">{['text', 'text_voice', 'voice'].map((m) => <option value={m} selected={m === me.translation_mode}>{m.replace('_', ' + ')}</option>)}</select></div>
              <div><label class="lb-label">Original volume <span data-vol="o">{me.original_audio_volume}</span>%</label><input type="range" name="original_audio_volume" min={0} max={100} value={me.original_audio_volume} class="w-full" /></div>
              <div><label class="lb-label">Translated volume <span data-vol="t">{me.translated_audio_volume}</span>%</label><input type="range" name="translated_audio_volume" min={0} max={100} value={me.translated_audio_volume} class="w-full" /></div>
              <button class="lb-btn lb-btn-primary lb-btn-sm" type="submit">Save</button>
            </form>
          </div>
          <div class="lb-card lb-card-pad">
            <h3 class="lb-card-title mb-3"><i class="fas fa-users text-amber-300"></i> Participants <span class="text-slate-500 text-sm" id="p-count"></span></h3>
            <div id="participants"><div class="lb-skeleton h-12"></div></div>
          </div>
          <div class="lb-card lb-card-pad flex-1 flex flex-col min-h-[200px]">
            <div class="flex items-center justify-between mb-2">
              <h3 class="lb-card-title"><i class="fas fa-closed-captioning text-violet-300"></i> Transcript</h3>
              <span class="lb-pill" id="pipeline-status"><span class="lb-dot lb-dot-amber"></span> <span>—</span></span>
            </div>
            <div id="transcript" class="lb-transcript flex-1"><p class="text-sm text-slate-500" id="transcript-empty">Speech will be transcribed and translated here in your language.</p></div>
          </div>
        </aside>
      </div>

      <footer class="lb-room-controls">
        <button class="lb-ctl is-off" id="ctl-mic" disabled title="Microphone"><i class="fas fa-microphone-slash"></i></button>
        <button class="lb-ctl is-off" id="ctl-cam" disabled title="Camera"><i class="fas fa-video-slash"></i></button>
        <button class="lb-ctl" id="ctl-share" disabled title="Share screen"><i class="fas fa-display"></i></button>
        <button class="lb-ctl" id="ctl-captions" disabled title="Live captions"><i class="fas fa-closed-captioning"></i></button>
        <button class="lb-ctl" id="ctl-participants" title="Participants"><i class="fas fa-users"></i></button>
        <button class="lb-ctl" id="ctl-translation" title="Translation settings"><i class="fas fa-language"></i></button>
        {me.role === 'host' ? <button class="lb-ctl is-danger" id="ctl-end" title="End meeting for everyone"><i class="fas fa-stop"></i></button> : null}
        <button class="lb-ctl is-leave" id="ctl-leave"><i class="fas fa-phone-slash"></i> Leave</button>
      </footer>
      <script src="https://cdn.jsdelivr.net/npm/livekit-client@2.22.2/dist/livekit-client.umd.js" crossorigin="anonymous"></script>
      <script src="/static/room.js"></script>
    </div>,
    { title: meeting.name, layout: 'bare' }
  )
})

export default join
