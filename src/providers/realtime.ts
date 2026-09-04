/**
 * Realtime media provider — LiveKit (WebRTC SFU + reliable data channels).
 *
 * The browser never sees LIVEKIT_API_KEY / LIVEKIT_API_SECRET. The Worker mints a short-lived
 * LiveKit access token (HS256 JWT) scoped to ONE room and ONE participant identity, using Web Crypto
 * only (no Node `crypto`, no server SDK — keeps the Worker bundle tiny and Cloudflare-compatible).
 *
 * Token spec: https://docs.livekit.io/home/get-started/authentication/
 */
import type { ProviderStatus } from './translation/types'
import type { Bindings } from '../types'

export interface LiveKitGrant {
  roomJoin: boolean
  room: string
  canPublish: boolean
  canSubscribe: boolean
  canPublishData: boolean
  canPublishSources?: Array<'camera' | 'microphone' | 'screen_share' | 'screen_share_audio'>
  roomAdmin?: boolean
  hidden?: boolean
}

export interface MintTokenInput {
  identity: string
  name: string
  /** Free-form JSON string exposed to other participants as `participant.metadata`. */
  metadata?: string
  grant: LiveKitGrant
  ttlSeconds?: number
}

export function realtimeProviderStatus(env: Bindings): ProviderStatus {
  const required = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']
  const missing = required.filter((k) => !env[k as keyof Bindings])
  if (missing.length) return { configured: false, reason: `Missing: ${missing.join(', ')}`, requiredEnv: required }
  if (!/^wss?:\/\//.test(env.LIVEKIT_URL!)) return { configured: false, reason: 'LIVEKIT_URL must start with wss://', requiredEnv: required }
  return { configured: true, provider: 'livekit' }
}

const enc = new TextEncoder()
function b64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === 'string' ? enc.encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Mint a LiveKit access token. Throws if LiveKit is not configured. */
export async function mintLiveKitToken(env: Bindings, input: MintTokenInput): Promise<{ token: string; url: string; expiresAt: number }> {
  const status = realtimeProviderStatus(env)
  if (!status.configured) throw new Error(`LiveKit not configured: ${status.reason}`)

  const now = Math.floor(Date.now() / 1000)
  const ttl = Math.min(Math.max(input.ttlSeconds ?? 4 * 3600, 60), 24 * 3600)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload: Record<string, unknown> = {
    iss: env.LIVEKIT_API_KEY,
    sub: input.identity,
    nbf: now - 10,
    iat: now,
    exp: now + ttl,
    jti: crypto.randomUUID(),
    name: input.name,
    video: input.grant
  }
  if (input.metadata) payload.metadata = input.metadata

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const key = await crypto.subtle.importKey('raw', enc.encode(env.LIVEKIT_API_SECRET!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput))
  return { token: `${signingInput}.${b64url(sig)}`, url: env.LIVEKIT_URL!, expiresAt: (now + ttl) * 1000 }
}

/**
 * Server-side LiveKit RoomService call (Twirp over HTTPS) — used by the host to disconnect a
 * participant or to close a room. Uses the same HS256 token with `roomAdmin`.
 */
export async function livekitRoomService(env: Bindings, method: 'RemoveParticipant' | 'DeleteRoom' | 'ListParticipants', body: Record<string, unknown>) {
  const status = realtimeProviderStatus(env)
  if (!status.configured) throw new Error(`LiveKit not configured: ${status.reason}`)
  const room = String(body.room)
  const { token } = await mintLiveKitToken(env, {
    identity: 'linguabridge-server', name: 'server', ttlSeconds: 60,
    grant: { roomJoin: false, room, canPublish: false, canSubscribe: false, canPublishData: false, roomAdmin: true }
  })
  const httpUrl = env.LIVEKIT_URL!.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '')
  const res = await fetch(`${httpUrl}/twirp/livekit.RoomService/${method}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`LiveKit ${method} failed: ${res.status} ${await res.text()}`)
  return res.json().catch(() => ({}))
}
