-- [2026-10-24 APPROVAL] Additive only; existing history and schedules stay intact.
-- Apply before starting the release that enables the role approval endpoints.
CREATE TABLE IF NOT EXISTS gb_schedule_approvals (
 request_id VARCHAR(64) NOT NULL PRIMARY KEY,
 request_key VARCHAR(100) NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 equipment_id VARCHAR(64) NOT NULL,
 inspection_id VARCHAR(64) NULL,
 review_id VARCHAR(64) NULL,
 type VARCHAR(40) NOT NULL,
 due_date DATE NOT NULL,
 assignee VARCHAR(100) NOT NULL,
 items TEXT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending',
 requested_by VARCHAR(64) NOT NULL,
 requester_name VARCHAR(100) NOT NULL,
 requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_by VARCHAR(64) NULL,
 reviewer_name VARCHAR(100) NULL,
 reviewed_at DATETIME NULL,
 note TEXT NOT NULL,
 follow_up_id VARCHAR(64) NULL,
 UNIQUE KEY uq_approval_actor_key(requested_by,request_key),
 UNIQUE KEY uq_approval_inspection(inspection_id),
 UNIQUE KEY uq_approval_review(review_id),
 UNIQUE KEY uq_approval_followup(follow_up_id),
 KEY ix_approval_status_time(status,requested_at),
 CONSTRAINT fk_approval_equipment FOREIGN KEY(equipment_id) REFERENCES equipment(equipment_id),
 CONSTRAINT fk_approval_inspection FOREIGN KEY(inspection_id,equipment_id) REFERENCES inspections(inspection_id,equipment_id),
 CONSTRAINT fk_approval_review FOREIGN KEY(review_id) REFERENCES maintenance_reviews(review_id),
 CONSTRAINT fk_approval_requester FOREIGN KEY(requested_by) REFERENCES gb_users(username),
 CONSTRAINT fk_approval_reviewer FOREIGN KEY(reviewed_by) REFERENCES gb_users(username),
 CONSTRAINT fk_approval_followup FOREIGN KEY(follow_up_id) REFERENCES follow_ups(follow_up_id),
 CONSTRAINT ck_approval_status CHECK(status IN ('pending','approved','rejected')),
 CONSTRAINT ck_approval_decision CHECK(
  (status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND follow_up_id IS NULL) OR
  (status='approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND follow_up_id IS NOT NULL) OR
  (status='rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND follow_up_id IS NULL)
 )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
GRANT SELECT,INSERT,UPDATE ON gummybearing_v5_draft.gb_schedule_approvals TO 'gummy_app'@'%';
