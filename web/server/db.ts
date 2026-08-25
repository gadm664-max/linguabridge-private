import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, InsertUserPreference, InsertMeeting, InsertMeetingParticipant, externalWebhookEvents, meetingMinutes, meetings, meetingParticipants, transcriptSegments, userPreferences, users, whatsappOptIns, organizationMembers, organizations, InsertOrganizationMember } from "../drizzle/schema";
import { buildUserDataExport } from "./dataExport";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

function toWorkspaceSlug(value: string, userId: number) {
  const normalized = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "workspace";
  return `${normalized}-${userId}`;
}

export async function getUserOrganizations(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: organizationMembers.role,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(asc(organizations.createdAt));
}

export async function ensurePersonalOrganization(user: { id: number; name: string | null; email: string | null }) {
  const existing = await getUserOrganizations(user.id);
  if (existing[0]) return existing[0];

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspaceName = user.name?.trim() || user.email?.split("@")[0]?.trim() || "Personal workspace";
  const organizationValues = {
    ownerUserId: user.id,
    name: `${workspaceName}'s workspace`,
    slug: toWorkspaceSlug(workspaceName, user.id),
  };
  const created = await db.insert(organizations).values(organizationValues).$returningId();
  const organizationId = created[0]?.id;
  if (!organizationId) throw new Error("Organization creation failed");

  const membership: InsertOrganizationMember = {
    organizationId,
    userId: user.id,
    role: "owner",
  };
  await db.insert(organizationMembers).values(membership);
  const result = await getUserOrganizations(user.id);
  if (!result[0]) throw new Error("Organization membership creation failed");
  return result[0];
}

export async function createMeeting(input: {
  hostUserId: number;
  inviteCode: string;
  title: string;
  storageConsent: boolean;
  inviteSharingEnabled: boolean;
  hostName: string;
  speakingLanguage: string;
  displayLanguage: string;
  voiceName: string;
  voiceRate: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const meetingValues: InsertMeeting = {
    hostUserId: input.hostUserId,
    inviteCode: input.inviteCode,
    title: input.title,
    status: "lobby",
    storageConsent: input.storageConsent,
    inviteSharingEnabled: input.inviteSharingEnabled,
  };
  const created = await db.insert(meetings).values(meetingValues).$returningId();
  const meetingId = created[0]?.id;
  if (!meetingId) throw new Error("Meeting creation failed");

  const participantValues: InsertMeetingParticipant = {
    meetingId,
    userId: input.hostUserId,
    displayName: input.hostName,
    speakingLanguage: input.speakingLanguage,
    displayLanguage: input.displayLanguage,
    voiceName: input.voiceName,
    voiceRate: input.voiceRate,
    storageConsent: input.storageConsent,
  };
  await db.insert(meetingParticipants).values(participantValues);
  return { id: meetingId, inviteCode: input.inviteCode, title: input.title, status: "lobby" as const, inviteSharingEnabled: input.inviteSharingEnabled };
}

export async function inviteCodeExists(inviteCode: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.select({ id: meetings.id }).from(meetings).where(eq(meetings.inviteCode, inviteCode)).limit(1);
  return result.length > 0;
}

export async function getMeetingForInvite(inviteCode: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.select({
    id: meetings.id,
    inviteCode: meetings.inviteCode,
    title: meetings.title,
    status: meetings.status,
    storageConsent: meetings.storageConsent,
    inviteSharingEnabled: meetings.inviteSharingEnabled,
    createdAt: meetings.createdAt,
  }).from(meetings).where(eq(meetings.inviteCode, inviteCode)).limit(1);
  return result[0] ?? null;
}

export async function listMeetingsForHost(hostUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(meetings).where(eq(meetings.hostUserId, hostUserId)).orderBy(desc(meetings.createdAt));
}

export async function getUserPreferences(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return result[0] ?? null;
}

export async function saveUserPreferences(userId: number, values: Omit<InsertUserPreference, "id" | "userId" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(userPreferences).values({ userId, ...values }).onDuplicateKeyUpdate({ set: values });
  return getUserPreferences(userId);
}

export async function exportUserAccountData(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const account = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!account[0]) throw new Error("Account unavailable");

  const preferences = await db.select({
    speakingLanguage: userPreferences.speakingLanguage,
    displayLanguage: userPreferences.displayLanguage,
    voiceName: userPreferences.voiceName,
    voiceRate: userPreferences.voiceRate,
    confirmStoragePerMeeting: userPreferences.confirmStoragePerMeeting,
    meetingReminders: userPreferences.meetingReminders,
    updatedAt: userPreferences.updatedAt,
  }).from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);

  const participation = await db.select({
    meetingId: meetings.id,
    title: meetings.title,
    status: meetings.status,
    meetingCreatedAt: meetings.createdAt,
    startedAt: meetings.startedAt,
    endedAt: meetings.endedAt,
    joinedAt: meetingParticipants.joinedAt,
    leftAt: meetingParticipants.leftAt,
    speakingLanguage: meetingParticipants.speakingLanguage,
    displayLanguage: meetingParticipants.displayLanguage,
    voiceName: meetingParticipants.voiceName,
    voiceRate: meetingParticipants.voiceRate,
    storageConsent: meetingParticipants.storageConsent,
  }).from(meetingParticipants).innerJoin(meetings, eq(meetingParticipants.meetingId, meetings.id)).where(eq(meetingParticipants.userId, userId)).orderBy(desc(meetings.createdAt));

  return buildUserDataExport(account[0], preferences[0] ?? null, participation);
}

export async function joinMeeting(input: {
  inviteCode: string;
  userId: number;
  displayName: string;
  speakingLanguage: string;
  displayLanguage: string;
  voiceName: string;
  voiceRate: string;
  storageConsent: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const meeting = await getMeetingForInvite(input.inviteCode);
  if (!meeting) return null;
  if (meeting.status === "ended") throw new Error("This meeting has ended");

  const existing = await db.select({ id: meetingParticipants.id }).from(meetingParticipants).where(and(eq(meetingParticipants.meetingId, meeting.id), eq(meetingParticipants.userId, input.userId), isNull(meetingParticipants.leftAt))).limit(1);
  if (!existing[0]) {
    await db.insert(meetingParticipants).values({
      meetingId: meeting.id,
      userId: input.userId,
      displayName: input.displayName,
      speakingLanguage: input.speakingLanguage,
      displayLanguage: input.displayLanguage,
      voiceName: input.voiceName,
      voiceRate: input.voiceRate,
      storageConsent: input.storageConsent,
    });
  }
  return meeting;
}

export async function isActiveMeetingParticipant(meetingId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const participant = await db.select({ id: meetingParticipants.id })
    .from(meetingParticipants)
    .where(and(
      eq(meetingParticipants.meetingId, meetingId),
      eq(meetingParticipants.userId, userId),
      isNull(meetingParticipants.leftAt),
    ))
    .limit(1);
  return Boolean(participant[0]);
}

export async function isMeetingPersistenceAllowed(meetingId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const meeting = await db.select({ storageConsent: meetings.storageConsent }).from(meetings).where(eq(meetings.id, meetingId)).limit(1);
  if (!meeting[0]?.storageConsent) return false;
  const participantWithoutConsent = await db.select({ id: meetingParticipants.id }).from(meetingParticipants).where(and(eq(meetingParticipants.meetingId, meetingId), isNull(meetingParticipants.leftAt), eq(meetingParticipants.storageConsent, false))).limit(1);
  return participantWithoutConsent.length === 0;
}

export async function appendTranscriptSegment(input: {
  meetingId: number;
  userId: number;
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const participant = await db.select().from(meetingParticipants).where(and(eq(meetingParticipants.meetingId, input.meetingId), eq(meetingParticipants.userId, input.userId), isNull(meetingParticipants.leftAt))).limit(1);
  if (!participant[0]) throw new Error("Only active participants can add a transcript segment");
  if (!(await isMeetingPersistenceAllowed(input.meetingId))) throw new Error("All active participants must consent before content is saved");
  await db.insert(transcriptSegments).values({
    meetingId: input.meetingId,
    participantId: participant[0].id,
    speakerName: participant[0].displayName,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    originalText: input.originalText,
    translatedText: input.translatedText,
  });
  return { saved: true };
}

export async function getTranscriptForMeeting(meetingId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(transcriptSegments).where(eq(transcriptSegments.meetingId, meetingId)).orderBy(transcriptSegments.happenedAt);
}

export async function getMinutesForMeeting(meetingId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.select().from(meetingMinutes).where(eq(meetingMinutes.meetingId, meetingId)).limit(1);
  return result[0] ?? null;
}

export async function saveMinutesForMeeting(input: { meetingId: number; summary: string; keyPoints: string[]; actionItems: string[] }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(meetingMinutes).values(input).onDuplicateKeyUpdate({ set: { summary: input.summary, keyPoints: input.keyPoints, actionItems: input.actionItems } });
  return getMinutesForMeeting(input.meetingId);
}

export async function claimExternalWebhookEvent(provider: string, eventId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  try {
    await db.insert(externalWebhookEvents).values({ provider, eventId });
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ER_DUP_ENTRY") return false;
    throw error;
  }
}

export async function getWhatsAppOptIn(senderHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.select().from(whatsappOptIns).where(eq(whatsappOptIns.senderHash, senderHash)).limit(1);
  return result[0] ?? null;
}

export async function setWhatsAppOptIn(input: { senderHash: string; optedIn: boolean; targetLanguage?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(whatsappOptIns).values({
    senderHash: input.senderHash,
    optedIn: input.optedIn,
    targetLanguage: input.targetLanguage ?? "ar",
  }).onDuplicateKeyUpdate({ set: {
    optedIn: input.optedIn,
    targetLanguage: input.targetLanguage ?? "ar",
  } });
}
