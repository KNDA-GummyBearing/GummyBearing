-- [2026-10-24 COMPLETION APPROVAL] Apply before starting this release.
-- Existing schedules/history are preserved. Pending/rejected requests never
-- change follow_ups.status; only a team lead's approval completes the schedule.
CREATE TABLE IF NOT EXISTS gb_completion_approvals (
 request_id VARCHAR(64) NOT NULL PRIMARY KEY,
 request_key VARCHAR(100) NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 follow_up_id VARCHAR(64) NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending',
 requested_by VARCHAR(64) NOT NULL,
 requester_name VARCHAR(100) NOT NULL,
 requested_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 reviewed_by VARCHAR(64) NULL,
 reviewer_name VARCHAR(100) NULL,
 reviewed_at DATETIME(6) NULL,
 completion_note TEXT NOT NULL,
 note TEXT NOT NULL,
 pending_follow_up_id VARCHAR(64) GENERATED ALWAYS AS
  (CASE WHEN status='pending' THEN follow_up_id ELSE NULL END) STORED,
 UNIQUE KEY uq_completion_actor_key(requested_by,request_key),
 UNIQUE KEY uq_completion_pending_followup(pending_follow_up_id),
 KEY ix_completion_followup_time(follow_up_id,requested_at),
 KEY ix_completion_status_time(status,requested_at),
 CONSTRAINT fk_completion_approval_followup FOREIGN KEY(follow_up_id) REFERENCES follow_ups(follow_up_id),
 CONSTRAINT fk_completion_approval_requester FOREIGN KEY(requested_by) REFERENCES gb_users(username),
 CONSTRAINT fk_completion_approval_reviewer FOREIGN KEY(reviewed_by) REFERENCES gb_users(username),
 CONSTRAINT ck_completion_approval_status CHECK(status IN ('pending','approved','rejected')),
 CONSTRAINT ck_completion_approval_decision CHECK(
  (status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
  (status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
 )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
GRANT SELECT,INSERT,UPDATE ON gummybearing_v5_draft.gb_completion_approvals TO 'gummy_app'@'%';
