-- [LOGIN ADD] Additive only; existing business columns/rows are never changed.
CREATE TABLE IF NOT EXISTS gb_users (
 username VARCHAR(64) NOT NULL PRIMARY KEY, display_name VARCHAR(100) NOT NULL,
 password_hash VARCHAR(255) NOT NULL, active TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
CREATE TABLE IF NOT EXISTS gb_sessions (
 token_hash CHAR(64) NOT NULL PRIMARY KEY, username VARCHAR(64) NOT NULL,
 csrf VARCHAR(64) NOT NULL, expires_at BIGINT NOT NULL, KEY ix_gb_sessions_expiry(expires_at),
 FOREIGN KEY(username) REFERENCES gb_users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
CREATE TABLE IF NOT EXISTS gb_login_attempts (
 bucket VARCHAR(160) NOT NULL PRIMARY KEY, attempts INT NOT NULL, reset_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
CREATE TABLE IF NOT EXISTS gb_inspection_authors (
 inspection_id VARCHAR(64) NOT NULL PRIMARY KEY, username VARCHAR(64) NOT NULL,
 FOREIGN KEY(inspection_id) REFERENCES inspections(inspection_id) ON DELETE RESTRICT,
 FOREIGN KEY(username) REFERENCES gb_users(username) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
CREATE TABLE IF NOT EXISTS gb_followup_completions (
 follow_up_id VARCHAR(64) NOT NULL PRIMARY KEY, username VARCHAR(64) NOT NULL,
 display_name VARCHAR(100) NOT NULL, completed_at DATETIME NOT NULL,
 FOREIGN KEY(follow_up_id) REFERENCES follow_ups(follow_up_id) ON DELETE RESTRICT,
 FOREIGN KEY(username) REFERENCES gb_users(username) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
GRANT SELECT, INSERT, UPDATE ON gummybearing_v5_draft.gb_users TO 'gummy_app'@'%';
GRANT SELECT, INSERT, DELETE ON gummybearing_v5_draft.gb_sessions TO 'gummy_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON gummybearing_v5_draft.gb_login_attempts TO 'gummy_app'@'%';
GRANT SELECT, INSERT ON gummybearing_v5_draft.gb_inspection_authors TO 'gummy_app'@'%';
GRANT SELECT, INSERT ON gummybearing_v5_draft.gb_followup_completions TO 'gummy_app'@'%';
