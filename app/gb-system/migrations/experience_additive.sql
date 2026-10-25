-- Personal visitor experience. No team rows or business records are modified.
CREATE TABLE IF NOT EXISTS gb_experience_visitors (
 visitor_id CHAR(32) COLLATE utf8mb4_0900_as_cs PRIMARY KEY,
 display_name VARCHAR(40) NOT NULL,
 process_key VARCHAR(16) NULL,
 current_round_id CHAR(32) COLLATE utf8mb4_0900_as_cs NOT NULL,
 creation_ip_hash CHAR(64) NOT NULL,
 created_epoch DOUBLE NOT NULL,
 expires_epoch DOUBLE NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 last_round_epoch DOUBLE NOT NULL,
 last_test_epoch DOUBLE NOT NULL DEFAULT 0,
 last_csv_epoch DOUBLE NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS gb_experience_sessions (
 token_hash CHAR(64) PRIMARY KEY,
 visitor_id CHAR(32) COLLATE utf8mb4_0900_as_cs NOT NULL,
 csrf VARCHAR(64) NOT NULL,
 expires_epoch DOUBLE NOT NULL,
 FOREIGN KEY(visitor_id) REFERENCES gb_experience_visitors(visitor_id) ON DELETE CASCADE,
 KEY ix_experience_session_expiry(expires_epoch)
);
CREATE TABLE IF NOT EXISTS gb_experience_settings (
 visitor_id CHAR(32) COLLATE utf8mb4_0900_as_cs PRIMARY KEY,
 email VARCHAR(254) NOT NULL DEFAULT '',
 email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 email_verified BOOLEAN NOT NULL DEFAULT FALSE,
 verification_id CHAR(32) NULL,
 verification_hash CHAR(64) NULL,
 verification_expires DOUBLE NOT NULL DEFAULT 0,
 verification_attempts INT NOT NULL DEFAULT 0,
 FOREIGN KEY(visitor_id) REFERENCES gb_experience_visitors(visitor_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS gb_experience_subscriptions (
 endpoint_hash CHAR(64) PRIMARY KEY,
 visitor_id CHAR(32) COLLATE utf8mb4_0900_as_cs NOT NULL,
 subscription_json JSON NOT NULL,
 created_epoch DOUBLE NOT NULL,
 FOREIGN KEY(visitor_id) REFERENCES gb_experience_visitors(visitor_id) ON DELETE CASCADE,
 KEY ix_experience_subscription_owner(visitor_id)
);
CREATE TABLE IF NOT EXISTS gb_experience_rounds (
 round_id CHAR(32) COLLATE utf8mb4_0900_as_cs PRIMARY KEY,
 visitor_id CHAR(32) COLLATE utf8mb4_0900_as_cs NOT NULL,
 revision CHAR(64) NOT NULL,
 request_id VARCHAR(100) COLLATE utf8mb4_0900_as_cs NOT NULL,
 created_epoch DOUBLE NOT NULL,
 FOREIGN KEY(visitor_id) REFERENCES gb_experience_visitors(visitor_id) ON DELETE CASCADE,
 UNIQUE KEY uq_experience_round_request(visitor_id, request_id)
);
CREATE TABLE IF NOT EXISTS gb_experience_pairs (
 code_hash CHAR(64) PRIMARY KEY,
 visitor_id CHAR(32) COLLATE utf8mb4_0900_as_cs NOT NULL,
 expires_epoch DOUBLE NOT NULL,
 consumed_epoch DOUBLE NULL,
 FOREIGN KEY(visitor_id) REFERENCES gb_experience_visitors(visitor_id) ON DELETE CASCADE,
 KEY ix_experience_pair_owner(visitor_id)
);
CREATE TABLE IF NOT EXISTS gb_experience_events (
 event_id CHAR(64) PRIMARY KEY,
 visitor_id CHAR(32) COLLATE utf8mb4_0900_as_cs NOT NULL,
 round_id CHAR(32) COLLATE utf8mb4_0900_as_cs NULL,
 kind VARCHAR(24) NOT NULL,
 equipment_id VARCHAR(32) NOT NULL DEFAULT '',
 title VARCHAR(200) NOT NULL,
 body TEXT NOT NULL,
 due_epoch DOUBLE NOT NULL,
 verification_id CHAR(32) NULL,
 FOREIGN KEY(visitor_id) REFERENCES gb_experience_visitors(visitor_id) ON DELETE CASCADE,
 FOREIGN KEY(round_id) REFERENCES gb_experience_rounds(round_id),
 KEY ix_experience_event_owner(visitor_id)
);
CREATE TABLE IF NOT EXISTS gb_experience_deliveries (
 delivery_id CHAR(64) PRIMARY KEY,
 event_id CHAR(64) NOT NULL,
 visitor_id CHAR(32) COLLATE utf8mb4_0900_as_cs NOT NULL,
 channel VARCHAR(16) NOT NULL,
 destination TEXT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'pending',
 detail VARCHAR(300) NOT NULL DEFAULT '',
 created_epoch DOUBLE NOT NULL,
 FOREIGN KEY(event_id) REFERENCES gb_experience_events(event_id) ON DELETE CASCADE,
 FOREIGN KEY(visitor_id) REFERENCES gb_experience_visitors(visitor_id) ON DELETE CASCADE,
 KEY ix_experience_delivery_pending(status,created_epoch),
 KEY ix_experience_delivery_owner(visitor_id)
);
CREATE TABLE IF NOT EXISTS gb_experience_limits (
 bucket_hash CHAR(64) PRIMARY KEY,
 attempts INT NOT NULL,
 reset_epoch DOUBLE NOT NULL,
 KEY ix_experience_limit_expiry(reset_epoch)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON gummybearing_v5_draft.gb_experience_visitors TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE,DELETE ON gummybearing_v5_draft.gb_experience_sessions TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE,DELETE ON gummybearing_v5_draft.gb_experience_settings TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE,DELETE ON gummybearing_v5_draft.gb_experience_subscriptions TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE,DELETE ON gummybearing_v5_draft.gb_experience_rounds TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE,DELETE ON gummybearing_v5_draft.gb_experience_pairs TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE,DELETE ON gummybearing_v5_draft.gb_experience_events TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE,DELETE ON gummybearing_v5_draft.gb_experience_deliveries TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE,DELETE ON gummybearing_v5_draft.gb_experience_limits TO 'gummy_app'@'%';
