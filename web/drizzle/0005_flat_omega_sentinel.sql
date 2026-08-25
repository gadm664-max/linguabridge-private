CREATE TABLE `passwordCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`passwordHash` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `passwordCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `passwordCredentials_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `refreshTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	`replacedByTokenHash` varchar(128),
	CONSTRAINT `refreshTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `refreshTokens_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `translationHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`sourceLanguage` varchar(16) NOT NULL,
	`targetLanguage` varchar(16) NOT NULL,
	`characterCount` int NOT NULL,
	`latencyMs` int,
	`success` boolean NOT NULL,
	`errorCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `translationHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `passwordCredentials` ADD CONSTRAINT `passwordCredentials_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refreshTokens` ADD CONSTRAINT `refreshTokens_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `translationHistory` ADD CONSTRAINT `translationHistory_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_idx` ON `refreshTokens` (`userId`,`revokedAt`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_expiry_idx` ON `refreshTokens` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `translation_history_user_idx` ON `translationHistory` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `translation_history_created_idx` ON `translationHistory` (`createdAt`);