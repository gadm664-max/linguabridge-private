CREATE TABLE `externalWebhookEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(32) NOT NULL,
	`eventId` varchar(255) NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `externalWebhookEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_webhook_event_unique` UNIQUE(`provider`,`eventId`)
);
--> statement-breakpoint
CREATE TABLE `whatsappOptIns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderHash` varchar(64) NOT NULL,
	`optedIn` boolean NOT NULL DEFAULT false,
	`targetLanguage` varchar(16) NOT NULL DEFAULT 'ar',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappOptIns_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsappOptIns_senderHash_unique` UNIQUE(`senderHash`)
);
