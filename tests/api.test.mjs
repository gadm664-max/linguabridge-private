/**
 * LinguaBridge Phase 1 — end-to-end API tests against a running server (default http://localhost:3000).
 * Run: npm test   (server must be running: pm2 start ecosystem.config.cjs)
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000'
let passed = 0, failed = 0
const jars = {} // name -> cookie string

function cookieJar(name) {
  return {
    get: () => jars[name] || '',
    set: (res) => {
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean)
      const map = Object.fromEntries((jars[name] || '').split('; ').filter(Boolean).map((c) => c.split('=')))
      for (const c of raw) {
        const [kv, ...attrs] = c.split(';'); const [k, v] = kv.split('=')
        if (attrs.some((a) => /max-age=0/i.test(a))) delete map[k]; else map[k] = v
      }
      jars[name] = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ')
    }
  }
}

async function req(jar, method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: jar.get(), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  })
  jar.set(res)
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data, headers: res.headers }
}

async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { failed++; console.log(`  ✗ ${name}\n      ${e.message}`) }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'assert'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
const ok = (v, msg) => { if (!v) throw new Error(msg || 'expected truthy') }

const host = cookieJar('host'), guestES = cookieJar('guestES'), guestFR = cookieJar('guestFR'), anon = cookieJar('anon')
const email = `host+${Date.now()}@linguabridge.test`
let meeting, invitation, privateRoom, privateInv

console.log(`\nLinguaBridge Phase 1 API tests → ${BASE}\n`)

console.log('Health & reference data')
await test('GET /api/health', async () => { const r = await req(anon, 'GET', '/api/health'); eq(r.status, 200); ok(r.data.db, 'DB bound') })
await test('GET /api/settings/reference has 7 languages & countries with flags', async () => {
  const r = await req(anon, 'GET', '/api/settings/reference'); eq(r.status, 200); eq(r.data.languages.length, 7); ok(r.data.countries.length > 50); ok(r.data.countries[0].flag)
})

console.log('\nAuthentication')
await test('register rejects weak password', async () => { const r = await req(anon, 'POST', '/api/auth/register', { email, name: 'Test', password: 'short' }); eq(r.status, 400) })
await test('register creates account + session cookie', async () => {
  const r = await req(host, 'POST', '/api/auth/register', { email, name: 'Mohamed Host', company: 'Cairo Consulting', password: 'StrongPass123' })
  eq(r.status, 201); eq(r.data.user.email, email); ok(host.get().includes('lb_session'), 'cookie set')
})
await test('duplicate email rejected', async () => { const r = await req(anon, 'POST', '/api/auth/register', { email, name: 'X', password: 'StrongPass123' }); eq(r.status, 400) })
await test('GET /api/auth/me returns user + settings', async () => { const r = await req(host, 'GET', '/api/auth/me'); eq(r.status, 200); eq(r.data.user.name, 'Mohamed Host'); ok(r.data.settings) })
await test('unauthenticated /api/auth/me → 401', async () => { eq((await req(anon, 'GET', '/api/auth/me')).status, 401) })
await test('login with wrong password → 401', async () => { eq((await req(anon, 'POST', '/api/auth/login', { email, password: 'nope-nope' })).status, 401) })
await test('login OK', async () => { const j = cookieJar('host2'); const r = await req(j, 'POST', '/api/auth/login', { email, password: 'StrongPass123' }); eq(r.status, 200); ok(j.get().includes('lb_session')) })
await test('/dashboard page redirects anonymous to /login', async () => { const r = await req(anon, 'GET', '/dashboard'); eq(r.status, 302); ok(r.headers.get('location').startsWith('/login')) })
await test('/dashboard page renders for host', async () => { const r = await req(host, 'GET', '/dashboard'); eq(r.status, 200); ok(String(r.data).includes('data-page="dashboard"')) })

console.log('\nUser settings (country ≠ language)')
await test('PUT /api/settings/me stores EG + English spoken + Arabic received', async () => {
  const r = await req(host, 'PUT', '/api/settings/me', { country_code: 'EG', spoken_language: 'en', translation_language: 'ar', auto_detect_language: true, translation_mode: 'text_voice' })
  eq(r.status, 200); eq(r.data.settings.country_code, 'EG'); eq(r.data.settings.primary_spoken_language, 'en'); eq(r.data.settings.preferred_translation_language, 'ar'); eq(r.data.settings.translation_mode, 'text_voice')
})
await test('invalid language rejected', async () => { eq((await req(host, 'PUT', '/api/settings/me', { spoken_language: 'xx' })).status, 400) })
await test('GET /api/settings/providers reports honest not-configured status', async () => {
  const r = await req(host, 'GET', '/api/settings/providers'); eq(r.status, 200)
  eq(r.data.speech_to_text.configured, false); ok(r.data.speech_to_text.requiredEnv.includes('DEEPGRAM_API_KEY'))
  ok(!JSON.stringify(r.data).includes('SESSION_SECRET'), 'no secrets leak')
})

console.log('\nMeetings & invitations')
await test('POST /api/meetings (instant) → meeting + invitation link', async () => {
  const r = await req(host, 'POST', '/api/meetings', { name: 'Business Meeting', type: 'instant', max_participants: 3, host_language: 'ar' })
  eq(r.status, 201); meeting = r.data.meeting; invitation = r.data.invitation
  eq(meeting.status, 'active'); ok(meeting.slug); ok(invitation.url.includes('/join/')); ok(invitation.expires_at, 'instant link expires'); ok(!('password_hash' in meeting), 'no hash leaked')
})
await test('POST /api/meetings (private_room) → persistent link', async () => {
  const r = await req(host, 'POST', '/api/meetings', { name: 'Carlos Garcia — Private Room', type: 'private_room', client_name: 'Carlos Garcia', require_password: true, password: 'hola1234' })
  eq(r.status, 201); privateRoom = r.data.meeting; privateInv = r.data.invitation
  eq(privateRoom.is_persistent, 1); eq(privateRoom.has_password, 1); eq(privateInv.expires_at, null); eq(privateInv.is_persistent, 1)
})
await test('POST /api/meetings (scheduled) requires date', async () => { eq((await req(host, 'POST', '/api/meetings', { name: 'Sched', type: 'scheduled' })).status, 400) })
await test('POST /api/meetings (scheduled) OK', async () => {
  const r = await req(host, 'POST', '/api/meetings', { name: 'Q3 Review', type: 'scheduled', scheduled_at: new Date(Date.now() + 864e5).toISOString() }); eq(r.status, 201); eq(r.data.meeting.status, 'scheduled')
})
await test('GET /api/meetings lists 3; ?type=private_room filters', async () => {
  eq((await req(host, 'GET', '/api/meetings')).data.meetings.length, 3)
  const r = await req(host, 'GET', '/api/meetings?type=private_room'); eq(r.data.meetings.length, 1); eq(r.data.meetings[0].client_name, 'Carlos Garcia')
})
await test('other user cannot read my meeting (authorization)', async () => {
  const other = cookieJar('other'); await req(other, 'POST', '/api/auth/register', { email: `o+${Date.now()}@lb.test`, name: 'Other', password: 'StrongPass123' })
  eq((await req(other, 'GET', `/api/meetings/${meeting.id}`)).status, 404)
})
await test('create extra invitation: single-use + 2h expiry', async () => {
  const r = await req(host, 'POST', `/api/meetings/${meeting.id}/invitations`, { label: 'Ahmed', single_use: true, expires_in_hours: 2 })
  eq(r.status, 201); eq(r.data.invitation.single_use, 1); ok(r.data.invitation.expires_at)
})
await test('disable invitation → join returns 410', async () => {
  const r = await req(host, 'POST', `/api/meetings/${meeting.id}/invitations`, { label: 'Temp' }); const inv = r.data.invitation
  eq((await req(host, 'PATCH', `/api/meetings/${meeting.id}/invitations/${inv.id}`, { is_active: false })).data.invitation.is_active, 0)
  const j = await req(anon, 'GET', `/api/join/${inv.token}`); eq(j.status, 410); eq(j.data.reason, 'disabled')
})
await test('invalid token → 410 not_found', async () => { const r = await req(anon, 'GET', '/api/join/not-a-real-token'); eq(r.status, 410); eq(r.data.reason, 'not_found') })

console.log('\nJoin flow — country and language selection')
await test('GET /api/join/:token returns meeting summary + reference data', async () => {
  const r = await req(guestES, 'GET', `/api/join/${invitation.token}`); eq(r.status, 200); eq(r.data.meeting.name, 'Business Meeting'); eq(r.data.host.name, 'Mohamed Host'); ok(r.data.countries.length); eq(r.data.meeting.requires_password, false)
})
await test('join rejects missing display_name', async () => { eq((await req(guestES, 'POST', `/api/join/${invitation.token}`, { spoken_language: 'es' })).status, 400) })
await test('join rejects unsupported country', async () => { eq((await req(guestES, 'POST', `/api/join/${invitation.token}`, { display_name: 'C', country_code: 'ZZ', spoken_language: 'es' })).status, 400) })
await test('guest joins: Spain / speaks Spanish / receives Spanish', async () => {
  const r = await req(guestES, 'POST', `/api/join/${invitation.token}`, { display_name: 'Carlos', country_code: 'ES', spoken_language: 'es', translation_language: 'es', auto_detect_language: true, translation_mode: 'text' })
  eq(r.status, 201); eq(r.data.participant.country_code, 'ES'); eq(r.data.participant.spoken_language, 'es'); eq(r.data.participant.translation_language, 'es'); eq(r.data.room_url, `/room/${meeting.slug}`)
  ok(guestES.get().includes('lb_participant'), 'participant cookie'); ok(!('participant_token' in r.data.participant), 'token not leaked')
})
await test('guest joins: Egypt / speaks English / receives French (country ≠ language)', async () => {
  const r = await req(guestFR, 'POST', `/api/join/${invitation.token}`, { display_name: 'Nour', country_code: 'EG', spoken_language: 'en', translation_language: 'fr', auto_detect_language: false, translation_mode: 'voice', original_audio_volume: 30, translated_audio_volume: 100 })
  eq(r.status, 201); const p = r.data.participant
  eq(p.country_code, 'EG'); eq(p.spoken_language, 'en'); eq(p.translation_language, 'fr'); eq(p.auto_detect_language, 0); eq(p.translation_mode, 'voice'); eq(p.original_audio_volume, 30)
})
await test('re-join from same browser updates instead of duplicating', async () => {
  const r = await req(guestES, 'POST', `/api/join/${invitation.token}`, { display_name: 'Carlos G.', country_code: 'ES', spoken_language: 'es', translation_language: 'ar' })
  eq(r.status, 201); eq(r.data.participant.translation_language, 'ar')
  const list = await req(host, 'GET', `/api/meetings/${meeting.id}/participants`); eq(list.data.participants.length, 2, 'still 2 participants')
})
await test('invitation use_count incremented', async () => {
  const r = await req(host, 'GET', `/api/meetings/${meeting.id}`); const inv = r.data.invitations.find((i) => i.id === invitation.id); eq(inv.use_count, 2)
})
await test('participant reads own prefs via /api/participants/:slug/me', async () => {
  const r = await req(guestFR, 'GET', `/api/participants/${meeting.slug}/me`); eq(r.status, 200); eq(r.data.participant.display_name, 'Nour'); eq(r.data.participants.length, 2)
})
await test('participant updates prefs mid-meeting', async () => {
  const r = await req(guestFR, 'PATCH', `/api/participants/${meeting.slug}/me`, { translation_language: 'de', show_original_text: false }); eq(r.status, 200); eq(r.data.participant.translation_language, 'de'); eq(r.data.participant.show_original_text, 0)
})
await test('capacity enforced (max 3: host not joined, 2 guests + 1 more OK, 4th refused)', async () => {
  const g3 = cookieJar('g3'); eq((await req(g3, 'POST', `/api/join/${invitation.token}`, { display_name: 'Third', spoken_language: 'de' })).status, 201)
  const g4 = cookieJar('g4'); eq((await req(g4, 'POST', `/api/join/${invitation.token}`, { display_name: 'Fourth', spoken_language: 'de' })).status, 409)
})
await test('single-use link exhausted after one join', async () => {
  const r = await req(host, 'POST', `/api/meetings/${privateRoom.id}/invitations`, { label: 'once', single_use: true }); const inv = r.data.invitation
  const a = cookieJar('su1'); const j1 = await req(a, 'POST', `/api/join/${inv.token}`, { display_name: 'A', spoken_language: 'es', password: 'hola1234' }); eq(j1.status, 201)
  const b = cookieJar('su2'); const j2 = await req(b, 'GET', `/api/join/${inv.token}`); eq(j2.status, 410); eq(j2.data.reason, 'exhausted')
})
await test('private room requires password; wrong → 403, right → 201', async () => {
  const g = cookieJar('pw'); eq((await req(g, 'POST', `/api/join/${privateInv.token}`, { display_name: 'Carlos', spoken_language: 'es', password: 'wrong' })).status, 403)
  eq((await req(g, 'POST', `/api/join/${privateInv.token}`, { display_name: 'Carlos', country_code: 'ES', spoken_language: 'es', password: 'hola1234' })).status, 201)
})
await test('host joins own room without password and gets role=host', async () => {
  const r = await req(host, 'POST', `/api/join/${privateInv.token}`, { display_name: 'Mohamed', country_code: 'EG', spoken_language: 'ar', translation_language: 'ar' }); eq(r.status, 201); eq(r.data.participant.role, 'host')
})
await test('host removes participant; removed participant cannot re-join', async () => {
  const list = (await req(host, 'GET', `/api/meetings/${meeting.id}/participants`)).data.participants; const nour = list.find((p) => p.display_name === 'Nour')
  eq((await req(host, 'POST', `/api/meetings/${meeting.id}/participants/${nour.id}/remove`)).status, 200)
  eq((await req(guestFR, 'POST', `/api/join/${invitation.token}`, { display_name: 'Nour', spoken_language: 'en' })).status, 403)
})
await test('participant leaves', async () => { eq((await req(guestES, 'POST', `/api/participants/${meeting.slug}/me/leave`)).status, 200); eq((await req(guestES, 'GET', `/api/participants/${meeting.slug}/me`)).status, 401) })

console.log('\nPages')
await test('/join/:token renders pre-join form with 4 steps', async () => { const r = await req(anon, 'GET', `/join/${invitation.token}`); eq(r.status, 200); const h = String(r.data); ok(h.includes('data-page="join"')); ok(h.includes('name="country_code"')); ok(h.includes('name="spoken_language"')); ok(h.includes('name="translation_language"')); ok(h.includes('translation_mode')) })
await test('/room/:slug without participant cookie → invitation required', async () => { const r = await req(anon, 'GET', `/room/${meeting.slug}`); eq(r.status, 200); ok(String(r.data).includes('Invitation required')) })
await test('/room/:slug with participant cookie → lobby', async () => { const g = cookieJar('pw'); const r = await req(g, 'GET', `/room/${privateRoom.slug}`); eq(r.status, 200); ok(String(r.data).includes('data-page="room"')) })
await test('/meetings/:id page for host', async () => { const r = await req(host, 'GET', `/meetings/${meeting.id}`); eq(r.status, 200); ok(String(r.data).includes('Invitation links')) })
await test('/nonexistent → 404 page', async () => { eq((await req(anon, 'GET', '/nope')).status, 404) })

console.log('\nLifecycle & dashboard')
await test('end meeting → participants marked left; ended link → 410', async () => {
  eq((await req(host, 'POST', `/api/meetings/${meeting.id}/end`)).data.meeting.status, 'ended')
  const j = await req(cookieJar('late'), 'GET', `/api/join/${invitation.token}`); eq(j.status, 410); eq(j.data.reason, 'meeting_ended')
})
await test('ended private room can still be re-entered (persistent)', async () => {
  await req(host, 'POST', `/api/meetings/${privateRoom.id}/end`)
  const g = cookieJar('again'); const r = await req(g, 'POST', `/api/join/${privateInv.token}`, { display_name: 'Carlos', spoken_language: 'es', password: 'hola1234' }); eq(r.status, 201)
  eq((await req(host, 'GET', `/api/meetings/${privateRoom.id}`)).data.meeting.status, 'active', 'room reactivated')
})
await test('GET /api/dashboard aggregates', async () => {
  const r = await req(host, 'GET', '/api/dashboard'); eq(r.status, 200); eq(r.data.counts.total, 3); eq(r.data.counts.private_rooms, 1); ok(r.data.language_usage.length >= 3); ok(r.data.recent_participants.length >= 1); eq(r.data.recent_clients[0].client_name, 'Carlos Garcia')
})
await test('contacts CRUD', async () => {
  const c = await req(host, 'POST', '/api/contacts', { name: 'Carlos Garcia', email: 'carlos@example.es', country_code: 'ES', spoken_language: 'es', translation_language: 'es' }); eq(c.status, 201)
  eq((await req(host, 'PUT', `/api/contacts/${c.data.contact.id}`, { name: 'Carlos García', country_code: 'ES' })).data.contact.name, 'Carlos García')
  eq((await req(host, 'GET', '/api/contacts?q=garc')).data.contacts.length, 1)
  eq((await req(host, 'DELETE', `/api/contacts/${c.data.contact.id}`)).status, 200)
})
await test('delete meeting cascades', async () => { eq((await req(host, 'DELETE', `/api/meetings/${meeting.id}`)).status, 200); eq((await req(host, 'GET', `/api/meetings/${meeting.id}`)).status, 404) })
await test('logout clears session', async () => { await req(host, 'POST', '/api/auth/logout'); eq((await req(host, 'GET', '/api/auth/me')).status, 401) })

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
