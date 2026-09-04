import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAuthApi } from '../lib/auth'
import { one, many } from '../lib/db'
import { listMeetings, publicMeeting } from '../services/meetings'

const dashboard = new Hono<AppEnv>()
dashboard.use('*', requireAuthApi)

dashboard.get('/', async (c) => {
  const uid = c.var.user!.id
  const [counts, recent, activeRooms, upcoming, langUsage, recentParticipants, durations, clients] = await Promise.all([
    one<{ total: number; active: number; private_rooms: number; ended: number }>(
      c.env.DB,
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN type = 'private_room' THEN 1 ELSE 0 END) AS private_rooms,
              SUM(CASE WHEN status = 'ended' THEN 1 ELSE 0 END) AS ended
         FROM meetings WHERE host_user_id = ?`, uid),
    listMeetings(c.env, uid, { limit: 8 }),
    listMeetings(c.env, uid, { status: 'active', limit: 6 }),
    many(c.env.DB, `SELECT m.id, m.name, m.scheduled_at, r.slug FROM meetings m JOIN meeting_rooms r ON r.meeting_id = m.id
                     WHERE m.host_user_id = ? AND m.status = 'scheduled' AND m.scheduled_at >= CURRENT_TIMESTAMP ORDER BY m.scheduled_at LIMIT 6`, uid),
    many<{ language: string; n: number }>(
      c.env.DB,
      `SELECT language, SUM(n) AS n FROM (
          SELECT p.spoken_language AS language, COUNT(*) AS n FROM meeting_participants p JOIN meetings m ON m.id = p.meeting_id WHERE m.host_user_id = ? GROUP BY p.spoken_language
          UNION ALL
          SELECT p.translation_language, COUNT(*) FROM meeting_participants p JOIN meetings m ON m.id = p.meeting_id WHERE m.host_user_id = ? GROUP BY p.translation_language
        ) GROUP BY language ORDER BY n DESC`, uid, uid),
    many(c.env.DB, `SELECT p.id, p.display_name, p.country_code, p.spoken_language, p.translation_language, p.joined_at, p.status, m.name AS meeting_name, m.id AS meeting_id
                      FROM meeting_participants p JOIN meetings m ON m.id = p.meeting_id
                     WHERE m.host_user_id = ? AND p.role != 'host' ORDER BY p.joined_at DESC LIMIT 8`, uid),
    one<{ total_minutes: number; sessions: number }>(
      c.env.DB,
      `SELECT COALESCE(SUM((julianday(COALESCE(m.ended_at, CURRENT_TIMESTAMP)) - julianday(m.started_at)) * 1440), 0) AS total_minutes,
              COUNT(*) AS sessions
         FROM meetings m WHERE m.host_user_id = ? AND m.started_at IS NOT NULL`, uid),
    many(c.env.DB, `SELECT m.id, m.name, r.client_name, r.slug, m.status, m.updated_at,
                           (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id) AS participant_count
                      FROM meetings m JOIN meeting_rooms r ON r.meeting_id = m.id
                     WHERE m.host_user_id = ? AND m.type = 'private_room' ORDER BY m.updated_at DESC LIMIT 6`, uid)
  ])

  return c.json({
    counts: { total: counts?.total ?? 0, active: counts?.active ?? 0, private_rooms: counts?.private_rooms ?? 0, ended: counts?.ended ?? 0 },
    total_minutes: Math.round(durations?.total_minutes ?? 0),
    recent_meetings: recent.map(publicMeeting),
    active_rooms: activeRooms.map(publicMeeting),
    upcoming,
    language_usage: langUsage,
    recent_participants: recentParticipants,
    recent_clients: clients
  })
})

export default dashboard
