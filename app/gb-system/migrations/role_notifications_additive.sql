-- [ROLE / ALERT PREVIEW] Additive only: keep all five old accounts and audit rows.
CREATE TABLE IF NOT EXISTS gb_demo_roles (
 username VARCHAR(64) COLLATE utf8mb4_0900_as_cs PRIMARY KEY,
 role_key VARCHAR(24) NOT NULL, process_key VARCHAR(24) NULL, sort_order INT NOT NULL,
 FOREIGN KEY(username) REFERENCES gb_users(username)
);
INSERT INTO gb_demo_roles VALUES ('ksm123','supervisor',NULL,1),('joy123','field','sinter',2),('kmj123','field','steel',3)
 ON DUPLICATE KEY UPDATE role_key=VALUES(role_key),process_key=VALUES(process_key),sort_order=VALUES(sort_order);
CREATE TABLE IF NOT EXISTS gb_notice_settings (
 username VARCHAR(64) COLLATE utf8mb4_0900_as_cs PRIMARY KEY,
 email VARCHAR(254) NOT NULL DEFAULT '', email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY(username) REFERENCES gb_users(username)
);
CREATE TABLE IF NOT EXISTS gb_push_subscriptions (
 endpoint_hash CHAR(64) PRIMARY KEY, username VARCHAR(64) COLLATE utf8mb4_0900_as_cs NOT NULL,
 subscription_json JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(username) REFERENCES gb_users(username)
);
CREATE TABLE IF NOT EXISTS gb_alert_jobs (
 job_id CHAR(32) PRIMARY KEY, username VARCHAR(64) COLLATE utf8mb4_0900_as_cs NOT NULL,
 kind VARCHAR(24) NOT NULL, created_epoch DOUBLE NOT NULL,
 FOREIGN KEY(username) REFERENCES gb_users(username)
);
CREATE TABLE IF NOT EXISTS gb_alert_events (
 event_id CHAR(64) PRIMARY KEY, job_id CHAR(32) NOT NULL, equipment_id VARCHAR(32) NOT NULL,
 title VARCHAR(200) NOT NULL, body TEXT NOT NULL, due_epoch DOUBLE NOT NULL,
 processed BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY(job_id) REFERENCES gb_alert_jobs(job_id)
);
CREATE TABLE IF NOT EXISTS gb_alert_deliveries (
 delivery_id CHAR(64) PRIMARY KEY, event_id CHAR(64) NOT NULL,
 username VARCHAR(64) COLLATE utf8mb4_0900_as_cs NOT NULL, channel VARCHAR(16) NOT NULL,
 destination TEXT NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'pending',
 detail VARCHAR(300) NOT NULL DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(event_id) REFERENCES gb_alert_events(event_id), FOREIGN KEY(username) REFERENCES gb_users(username)
);
GRANT SELECT ON gummybearing_v5_draft.gb_demo_roles TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE,DELETE ON gummybearing_v5_draft.gb_notice_settings TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE,DELETE ON gummybearing_v5_draft.gb_push_subscriptions TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE ON gummybearing_v5_draft.gb_alert_jobs TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE ON gummybearing_v5_draft.gb_alert_events TO 'gummy_app'@'%';
GRANT SELECT,INSERT,UPDATE ON gummybearing_v5_draft.gb_alert_deliveries TO 'gummy_app'@'%';
