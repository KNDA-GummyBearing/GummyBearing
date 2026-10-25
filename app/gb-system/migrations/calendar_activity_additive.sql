-- Record the authenticated creator of future schedules. Never infer legacy creators.
CREATE TABLE IF NOT EXISTS gb_followup_authors (
 follow_up_id VARCHAR(64) NOT NULL PRIMARY KEY,
 username VARCHAR(64) NOT NULL,
 created_at DATETIME NOT NULL,
 KEY ix_gb_followup_authors_user (username,created_at),
 FOREIGN KEY(follow_up_id) REFERENCES follow_ups(follow_up_id) ON DELETE RESTRICT,
 FOREIGN KEY(username) REFERENCES gb_users(username) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
GRANT SELECT, INSERT ON gummybearing_v5_draft.gb_followup_authors TO 'gummy_app'@'%';
