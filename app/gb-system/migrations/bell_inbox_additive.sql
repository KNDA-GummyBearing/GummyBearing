-- [2026-10-24 BELL INBOX] Events already exist; store only per-recipient reads.
-- This does not queue, re-send or alter any mobile push/email delivery.
CREATE TABLE IF NOT EXISTS gb_bell_reads (
 event_id CHAR(64) NOT NULL,
 username VARCHAR(64) COLLATE utf8mb4_0900_as_cs NOT NULL,
 read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(event_id,username),
 KEY ix_bell_reads_user(username,read_at),
 FOREIGN KEY(event_id) REFERENCES gb_alert_events(event_id) ON DELETE CASCADE,
 FOREIGN KEY(username) REFERENCES gb_users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
GRANT SELECT,INSERT ON gummybearing_v5_draft.gb_bell_reads TO 'gummy_app'@'%';
