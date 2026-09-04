# LinguaBridge — Implementation Plan

> Produced after inspecting the actual repository state on 2026-09-02.

## 0. Repository inspection findings

| Item | Finding |
|---|---|
| Framework | **Hono 4.x** on **Cloudflare Pages** (`@hono/vite-build/cloudflare-pages`) |
| Runtime | Cloudflare Workers (V8 isolate, `nodejs_compat` flag) |
| Existing code | `src/index.tsx` ("Hello!" route), `src/renderer.tsx`, `public/static/style.css` |
| Database | **None** configured |
| Git history | Single "Initial commit" |
| Express / tRPC / Socket.IO / Drizzle / MySQL / TiDB | **Not present** in this repository |

**Conclusion:** the build request's "existing stack" (Express + tRPC + Socket.IO + Drizzle + MySQL) does not
exist here. The only working infrastructure is the Hono + Cloudflare Pages scaffold, which we preserve and
extend. Nothing is deleted.

## 1. Architectural decisions (documented per rule 26.10)

### AD-1: Backend = Hono on Cloudflare Workers, TypeScript, modular routes
Cloudflare Workers cannot host Express, Socket.IO servers, or connect to MySQL over TCP. We keep the
modular/TypeScript spirit of the request with Hono route modules:
`src/routes/{auth,meetings,rooms,invitations,participants,contacts,settings}.ts`.

### AD-2: Database = Cloudflare D1 (SQLite) with SQL migrations
D1 is the only relational store natively available to Workers and to the platform's hosted deploy.
Schema lives in `migrations/*.sql`. Local dev uses `wrangler --local` SQLite automatically.
Queries are written with prepared statements (parameterised) through a thin `src/lib/db.ts` helper.

### AD-3: Authentication = email + password (PBKDF2 via Web Crypto) + HttpOnly session cookies
JWT secrets and password hashing never touch the frontend. Sessions are stored in D1 (`sessions` table)
so they can be revoked. Web Crypto (`crypto.subtle`) is used because Node `crypto` is unavailable.

### AD-4: Real-time media (Phase 2/5) = LiveKit
LiveKit is WebRTC-native, has an official JS client SDK and a server REST/JWT API that a Worker can call.
The Worker will mint short-lived room tokens (API key/secret stay server-side). Not implemented in Phase 1;
the data model already carries `livekit_room_name` on rooms so no schema change is needed later.

### AD-5: Real-time events (Phase 2+) = LiveKit data channels (not a separate Socket.IO server)
Workers cannot keep a Socket.IO server alive. LiveKit already provides a reliable per-room data channel,
so transcripts / translations will be published there — one connection per participant, no duplicates.
Event names from section 19 are declared as TypeScript types in `src/lib/events.ts` from Phase 1 so later
phases share one contract.

### AD-6: STT (Phase 3) = Deepgram, key server-side only
Two viable paths on this stack: (a) LiveKit Agents worker with the Deepgram plugin, or (b) the Worker
mints a short-lived Deepgram temporary key for a direct browser WebSocket. Decision deferred to Phase 3.
`DEEPGRAM_API_KEY` is declared in `.dev.vars.example` and never sent to the client.

### AD-7: Provider abstraction from day one
`src/providers/{stt,translation,tts}/types.ts` declare the `TranslationProvider`,
`SpeechToTextProvider`, `TextToSpeechProvider` interfaces. **No fake providers are implemented.**
Concrete providers arrive in their phase, gated by env configuration.

### AD-8: Country ≠ language
`meeting_participants` stores `country_code`, `spoken_language`, `translation_language`,
`auto_detect_language`, `translation_mode`, volumes — all independent columns.

## 2. Phase map

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: auth, dashboard, meetings, private rooms, invitations, join page, country/language selection, preferences storage, DB schema | **This delivery** |
| 2 | LiveKit audio rooms, participant presence, mic controls | Requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| 3 | Deepgram streaming STT (ar/en/es), partial/final transcripts | Requires `DEEPGRAM_API_KEY` |
| 4 | Translation groups per target language, caching, live captions | Requires a translation provider key |
| 5 | Video grid, camera, screen share (LiveKit) | — |
| 6 | TTS translated voice, audio mixing | Requires a TTS provider key |
| 7 | History, transcripts, analytics, contacts polish | — |

## 3. Phase 1 deliverables

1. `migrations/0001_initial_schema.sql` — 11 tables
2. Auth: register / login / logout / me
3. Meetings CRUD (instant / private_room / scheduled), settings JSON, status
4. Private client rooms (persistent, reusable, optional password, participant history)
5. Invitations: secure token, expiry, single-use, max uses, password, disable
6. `/join/:token` pre-join page: name, searchable country w/ flags, spoken language, translation language,
   auto-detect toggle, translation mode
7. Participant preference storage + `/room/:id` lobby that reads them (media wiring = Phase 2)
8. Dashboard with real counts from D1
9. Contacts + user settings (default language preferences)
