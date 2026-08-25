import { boolean, index, int, json, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const meetings = mysqlTable("meetings", {
  id: int("id").autoincrement().primaryKey(),
  hostUserId: int("hostUserId").notNull().references(() => users.id),
  inviteCode: varchar("inviteCode", { length: 32 }).notNull().unique(),
  title: varchar("title", { length: 160 }).notNull(),
  status: mysqlEnum("status", ["lobby", "active", "ended"]).default("lobby").notNull(),
  storageConsent: boolean("storageConsent").default(false).notNull(),
  inviteSharingEnabled: boolean("inviteSharingEnabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  startedAt: timestamp("startedAt"),
  endedAt: timestamp("endedAt"),
}, table => [
  index("meetings_host_created_idx").on(table.hostUserId, table.createdAt),
]);

export const meetingParticipants = mysqlTable("meetingParticipants", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId").notNull().references(() => meetings.id),
  userId: int("userId").references(() => users.id),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  speakingLanguage: varchar("speakingLanguage", { length: 16 }).notNull(),
  displayLanguage: varchar("displayLanguage", { length: 16 }).notNull(),
  voiceName: varchar("voiceName", { length: 64 }).default("natural").notNull(),
  voiceRate: varchar("voiceRate", { length: 8 }).default("1.0").notNull(),
  storageConsent: boolean("storageConsent").default(false).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  leftAt: timestamp("leftAt"),
}, table => [
  index("participants_meeting_idx").on(table.meetingId),
  index("participants_user_idx").on(table.userId),
]);

export const transcriptSegments = mysqlTable("transcriptSegments", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId").notNull().references(() => meetings.id),
  participantId: int("participantId").references(() => meetingParticipants.id),
  speakerName: varchar("speakerName", { length: 160 }).notNull(),
  sourceLanguage: varchar("sourceLanguage", { length: 16 }).notNull(),
  targetLanguage: varchar("targetLanguage", { length: 16 }).notNull(),
  originalText: text("originalText").notNull(),
  translatedText: text("translatedText"),
  happenedAt: timestamp("happenedAt").defaultNow().notNull(),
}, table => [
  index("segments_meeting_time_idx").on(table.meetingId, table.happenedAt),
]);

export const meetingMessages = mysqlTable("meetingMessages", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId").notNull().references(() => meetings.id),
  participantId: int("participantId").references(() => meetingParticipants.id),
  originalText: text("originalText").notNull(),
  translatedText: text("translatedText"),
  sourceLanguage: varchar("sourceLanguage", { length: 16 }).notNull(),
  targetLanguage: varchar("targetLanguage", { length: 16 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("messages_meeting_time_idx").on(table.meetingId, table.createdAt),
]);

export const meetingMinutes = mysqlTable("meetingMinutes", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId").notNull().references(() => meetings.id).unique(),
  summary: text("summary"),
  keyPoints: json("keyPoints").$type<string[]>(),
  actionItems: json("actionItems").$type<string[]>(),
  shareToken: varchar("shareToken", { length: 64 }).unique(),
  sharedAt: timestamp("sharedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const userPreferences = mysqlTable("userPreferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id).unique(),
  speakingLanguage: varchar("speakingLanguage", { length: 16 }).default("ar").notNull(),
  displayLanguage: varchar("displayLanguage", { length: 16 }).default("en").notNull(),
  voiceName: varchar("voiceName", { length: 64 }).default("natural").notNull(),
  voiceRate: varchar("voiceRate", { length: 8 }).default("1.0").notNull(),
  confirmStoragePerMeeting: boolean("confirmStoragePerMeeting").default(true).notNull(),
  meetingReminders: boolean("meetingReminders").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const externalWebhookEvents = mysqlTable("externalWebhookEvents", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  eventId: varchar("eventId", { length: 255 }).notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
}, table => [
  unique("external_webhook_event_unique").on(table.provider, table.eventId),
]);

export const whatsappOptIns = mysqlTable("whatsappOptIns", {
  id: int("id").autoincrement().primaryKey(),
  senderHash: varchar("senderHash", { length: 64 }).notNull().unique(),
  optedIn: boolean("optedIn").default(false).notNull(),
  targetLanguage: varchar("targetLanguage", { length: 16 }).default("ar").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Meeting = typeof meetings.$inferSelect;
export type InsertMeeting = typeof meetings.$inferInsert;
export type MeetingParticipant = typeof meetingParticipants.$inferSelect;
export type InsertMeetingParticipant = typeof meetingParticipants.$inferInsert;
export type TranscriptSegment = typeof transcriptSegments.$inferSelect;
export type MeetingMessage = typeof meetingMessages.$inferSelect;
export type MeetingMinute = typeof meetingMinutes.$inferSelect;
export type UserPreference = typeof userPreferences.$inferSelect;
export type InsertUserPreference = typeof userPreferences.$inferInsert;
export type WhatsappOptIn = typeof whatsappOptIns.$inferSelect;
