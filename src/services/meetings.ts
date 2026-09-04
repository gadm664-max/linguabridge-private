/**
 * Meeting domain service — shared by API routes and server-rendered pages.
 */
import type { Bindings, MeetingRow, RoomRow, InvitationRow, ParticipantRow, MeetingType } from '../types'
import { one, many, run } from '../lib/db'
import { uuid, shortId, randomToken, hashPassword } from '../lib/crypto'

export interface CreateMeetingInput {
  host_user_id: string
  name: string
  type: MeetingType
  scheduled_at: string | null
  video_enabled: boolean
  translation_enabled: boolean
  allow_language_selection: boolean
  auto_language_detection: boolean
  password: string | null
  max_participants: number
  host_language: string
  client_name: string | null
  client_contact_id: string | null
}

export interface MeetingWithRoom extends MeetingRow {
  room_id: string
  slug: string
  is_persistent: number
  client_name: string | null
  client_contact_id: string | null
  is_locked: number
  has_password: number
  participant_count?: number
}

const MEETING_SELECT = `
  SELECT m.*, r.id AS room_id, r.slug, r.is_persistent, r.client_name, r.client_contact_id, r.is_locked,
         CASE WHEN m.password_hash IS NULL THEN 0 ELSE 1 END AS has_password
    FROM meetings m JOIN meeting_rooms r ON r.meeting_id = m.id`

export async function createMeeting(env: Bindings, input: CreateMeetingInput): Promise<{ meeting: MeetingWithRoom; invitation: InvitationRow }> {
  const meetingId = uuid()
  const roomId = uuid()
  const slug = shortId(10)
  const isPersistent = input.type === 'private_room'
  const status = input.type === 'scheduled' ? 'scheduled' : 'active'
  const passwordHash = input.password ? await hashPassword(input.password) : null

  const invitationId = uuid()
  const token = randomToken(20)

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO meetings (id, host_user_id, name, type, status, scheduled_at, started_at, video_enabled, translation_enabled,
         allow_language_selection, auto_language_detection, password_hash, max_participants, host_language)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      meetingId, input.host_user_id, input.name, input.type, status, input.scheduled_at,
      status === 'active' ? new Date().toISOString() : null,
      input.video_enabled ? 1 : 0, input.translation_enabled ? 1 : 0, input.allow_language_selection ? 1 : 0,
      input.auto_language_detection ? 1 : 0, passwordHash, input.max_participants, input.host_language
    ),
    env.DB.prepare(
      `INSERT INTO meeting_rooms (id, meeting_id, slug, livekit_room_name, is_persistent, client_name, client_contact_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(roomId, meetingId, slug, `lb-${slug}`, isPersistent ? 1 : 0, input.client_name, input.client_contact_id),
    // Default invitation link: persistent for private rooms, otherwise expires in 7 days.
    env.DB.prepare(
      `INSERT INTO meeting_invitations (id, meeting_id, token, label, expires_at, is_persistent, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      invitationId, meetingId, token, isPersistent ? 'Primary room link' : 'Default link',
      isPersistent ? null : new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 19).replace('T', ' '),
      isPersistent ? 1 : 0, input.host_user_id
    )
  ])

  const meeting = (await getMeeting(env, meetingId))!
  const invitation = (await one<InvitationRow>(env.DB, 'SELECT * FROM meeting_invitations WHERE id = ?', invitationId))!
  return { meeting, invitation }
}

export async function getMeeting(env: Bindings, id: string): Promise<MeetingWithRoom | null> {
  return one<MeetingWithRoom>(env.DB, `${MEETING_SELECT} WHERE m.id = ?`, id)
}

export async function getMeetingBySlug(env: Bindings, slug: string): Promise<MeetingWithRoom | null> {
  return one<MeetingWithRoom>(env.DB, `${MEETING_SELECT} WHERE r.slug = ?`, slug)
}

export async function listMeetings(env: Bindings, hostId: string, filter: { type?: MeetingType; status?: string; limit?: number } = {}): Promise<MeetingWithRoom[]> {
  const where: string[] = ['m.host_user_id = ?']
  const params: unknown[] = [hostId]
  if (filter.type) { where.push('m.type = ?'); params.push(filter.type) }
  if (filter.status) { where.push('m.status = ?'); params.push(filter.status) }
  params.push(filter.limit ?? 50)
  return many<MeetingWithRoom>(
    env.DB,
    `${MEETING_SELECT.replace('SELECT m.*', 'SELECT m.*, (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id) AS participant_count')}
      WHERE ${where.join(' AND ')} ORDER BY m.created_at DESC LIMIT ?`,
    ...params
  )
}

export async function updateMeetingStatus(env: Bindings, id: string, status: 'active' | 'ended' | 'cancelled'): Promise<void> {
  if (status === 'active') {
    await run(env.DB, `UPDATE meetings SET status = 'active', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), ended_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, id)
  } else {
    await run(env.DB, `UPDATE meetings SET status = ?, ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, status, id)
    await run(env.DB, `UPDATE meeting_participants SET status = 'left', left_at = CURRENT_TIMESTAMP WHERE meeting_id = ? AND status = 'joined'`, id)
  }
}

export async function listInvitations(env: Bindings, meetingId: string): Promise<InvitationRow[]> {
  return many<InvitationRow>(env.DB, 'SELECT * FROM meeting_invitations WHERE meeting_id = ? ORDER BY created_at DESC', meetingId)
}

export async function listParticipants(env: Bindings, meetingId: string, limit = 100): Promise<ParticipantRow[]> {
  return many<ParticipantRow>(env.DB, 'SELECT * FROM meeting_participants WHERE meeting_id = ? ORDER BY joined_at DESC LIMIT ?', meetingId, limit)
}

export async function getRoom(env: Bindings, meetingId: string): Promise<RoomRow | null> {
  return one<RoomRow>(env.DB, 'SELECT * FROM meeting_rooms WHERE meeting_id = ?', meetingId)
}

/** Public-safe shape (never exposes password hashes). */
export function publicMeeting(m: MeetingWithRoom) {
  const { password_hash: _p, ...rest } = m
  return rest
}

export function publicInvitation(i: InvitationRow, baseUrl: string) {
  const { password_hash, ...rest } = i
  return { ...rest, has_password: password_hash ? 1 : 0, url: `${baseUrl}/join/${i.token}` }
}

export function publicParticipant(p: ParticipantRow) {
  const { participant_token: _t, ...rest } = p
  return rest
}

/**
 * Validates an invitation token for joining. Returns a reason string on failure.
 */
export type InvitationCheck =
  | { ok: true; invitation: InvitationRow; meeting: MeetingWithRoom }
  | { ok: false; reason: 'not_found' | 'disabled' | 'expired' | 'exhausted' | 'meeting_ended' | 'meeting_cancelled' | 'room_locked' }

export async function checkInvitation(env: Bindings, token: string): Promise<InvitationCheck> {
  const invitation = await one<InvitationRow>(env.DB, 'SELECT * FROM meeting_invitations WHERE token = ?', token)
  if (!invitation) return { ok: false, reason: 'not_found' }
  if (!invitation.is_active) return { ok: false, reason: 'disabled' }
  if (invitation.expires_at && new Date(invitation.expires_at.replace(' ', 'T') + 'Z').getTime() < Date.now()) return { ok: false, reason: 'expired' }
  if (invitation.single_use && invitation.use_count >= 1) return { ok: false, reason: 'exhausted' }
  if (invitation.max_uses !== null && invitation.use_count >= invitation.max_uses) return { ok: false, reason: 'exhausted' }
  const meeting = await getMeeting(env, invitation.meeting_id)
  if (!meeting) return { ok: false, reason: 'not_found' }
  if (meeting.status === 'cancelled') return { ok: false, reason: 'meeting_cancelled' }
  // Persistent private rooms can always be re-entered; ended one-off meetings cannot.
  if (meeting.status === 'ended' && !meeting.is_persistent) return { ok: false, reason: 'meeting_ended' }
  if (meeting.is_locked) return { ok: false, reason: 'room_locked' }
  return { ok: true, invitation, meeting }
}

export const INVITATION_ERROR_MESSAGES: Record<Exclude<InvitationCheck, { ok: true }>['reason'], string> = {
  not_found: 'This invitation link is invalid.',
  disabled: 'This invitation link has been disabled by the host.',
  expired: 'This invitation link has expired.',
  exhausted: 'This invitation link has reached its maximum number of uses.',
  meeting_ended: 'This meeting has already ended.',
  meeting_cancelled: 'This meeting was cancelled.',
  room_locked: 'The host has locked this room.'
}
