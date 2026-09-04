CREATE TABLE `meetingMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`meetingId` int NOT NULL,
	`participantId` int,
	`originalText` text NOT NULL,
	`translatedText` text,
	`sourceLanguage` varchar(16) NOT NULL,
	`targetLanguage` varchar(16) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `meetingMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meetingMinutes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`meetingId` int NOT NULL,
	`summary` text,
	`keyPoints` json,
	`actionItems` json,
	`shareToken` varchar(64),
	`sharedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `meetingMinutes_id` PRIMARY KEY(`id`),
	CONSTRAINT `meetingMinutes_meetingId_unique` UNIQUE(`meetingId`),
	CONSTRAINT `meetingMinutes_shareToken_unique` UNIQUE(`shareToken`)
);
--> statement-breakpoint
CREATE TABLE `meetingParticipants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`meetingId` int NOT NULL,
	`userId` int,
	`displayName` varchar(160) NOT NULL,
	`speakingLanguage` varchar(16) NOT NULL,
	`displayLanguage` varchar(16) NOT NULL,
	`voiceName` varchar(64) NOT NULL DEFAULT 'natural',
	`voiceRate` varchar(8) NOT NULL DEFAULT '1.0',
	`storageConsent` boolean NOT NULL DEFAULT false,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`leftAt` timestamp,
	CONSTRAINT `meetingParticipants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`hostUserId` int NOT NULL,
	`inviteCode` varchar(32) NOT NULL,
	`title` varchar(160) NOT NULL,
	`status` enum('lobby','active','ended') NOT NULL DEFAULT 'lobby',
	`storageConsent` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`startedAt` timestamp,
	`endedAt` timestamp,
	CONSTRAINT `meetings_id` PRIMARY KEY(`id`),
	CONSTRAINT `meetings_inviteCode_unique` UNIQUE(`inviteCode`)
);
--> statement-breakpoint
CREATE TABLE `transcriptSegments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`meetingId` int NOT NULL,
	`participantId` int,
	`speakerName` varchar(160) NOT NULL,
	`sourceLanguage` varchar(16) NOT NULL,
	`targetLanguage` varchar(16) NOT NULL,
	`originalText` text NOT NULL,
	`translatedText` text,
	`happenedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transcriptSegments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`speakingLanguage` varchar(16) NOT NULL DEFAULT 'ar',
	`displayLanguage` varchar(16) NOT NULL DEFAULT 'en',
	`voiceName` varchar(64) NOT NULL DEFAULT 'natural',
	`voiceRate` varchar(8) NOT NULL DEFAULT '1.0',
	`confirmStoragePerMeeting` boolean NOT NULL DEFAULT true,
	`meetingReminders` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `userPreferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `meetingMessages` ADD CONSTRAINT `meetingMessages_meetingId_meetings_id_fk` FOREIGN KEY (`meetingId`) REFERENCES `meetings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meetingMessages` ADD CONSTRAINT `meetingMessages_participantId_meetingParticipants_id_fk` FOREIGN KEY (`participantId`) REFERENCES `meetingParticipants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meetingMinutes` ADD CONSTRAINT `meetingMinutes_meetingId_meetings_id_fk` FOREIGN KEY (`meetingId`) REFERENCES `meetings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meetingParticipants` ADD CONSTRAINT `meetingParticipants_meetingId_meetings_id_fk` FOREIGN KEY (`meetingId`) REFERENCES `meetings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meetingParticipants` ADD CONSTRAINT `meetingParticipants_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_hostUserId_users_id_fk` FOREIGN KEY (`hostUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transcriptSegments` ADD CONSTRAINT `transcriptSegments_meetingId_meetings_id_fk` FOREIGN KEY (`meetingId`) REFERENCES `meetings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transcriptSegments` ADD CONSTRAINT `transcriptSegments_participantId_meetingParticipants_id_fk` FOREIGN KEY (`participantId`) REFERENCES `meetingParticipants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userPreferences` ADD CONSTRAINT `userPreferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `messages_meeting_time_idx` ON `meetingMessages` (`meetingId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `participants_meeting_idx` ON `meetingParticipants` (`meetingId`);--> statement-breakpoint
CREATE INDEX `participants_user_idx` ON `meetingParticipants` (`userId`);--> statement-breakpoint
CREATE INDEX `meetings_host_created_idx` ON `meetings` (`hostUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `segments_meeting_time_idx` ON `transcriptSegments` (`meetingId`,`happenedAt`);