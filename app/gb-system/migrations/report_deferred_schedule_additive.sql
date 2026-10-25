-- [2026-10-24] New report submissions defer the followup date to team-lead review.
-- Apply after schedule_approvals_additive.sql, before starting the updated app.
-- Existing requests receive 'schedule'; their dates and decision audits stay intact.
-- Restart-safe: rerunning this migration does not rewrite business records.
SET @gb_report_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='gb_schedule_approvals'
     AND column_name='submission_kind') = 0,
  'ALTER TABLE gb_schedule_approvals ADD COLUMN submission_kind VARCHAR(16) NOT NULL DEFAULT ''schedule''',
  'SELECT 1');
PREPARE gb_report_stmt FROM @gb_report_ddl;
EXECUTE gb_report_stmt;
DEALLOCATE PREPARE gb_report_stmt;

SET @gb_report_ddl = IF(
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_schema=DATABASE() AND table_name='gb_schedule_approvals'
     AND column_name='due_date') = 'NO',
  'ALTER TABLE gb_schedule_approvals MODIFY COLUMN due_date DATE NULL',
  'SELECT 1');
PREPARE gb_report_stmt FROM @gb_report_ddl;
EXECUTE gb_report_stmt;
DEALLOCATE PREPARE gb_report_stmt;

SET @gb_report_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema=DATABASE() AND table_name='gb_schedule_approvals'
     AND constraint_name='ck_approval_submission_kind') = 0,
  'ALTER TABLE gb_schedule_approvals ADD CONSTRAINT ck_approval_submission_kind CHECK (
    (submission_kind=''schedule'' AND due_date IS NOT NULL) OR
    (submission_kind=''report'' AND inspection_id IS NOT NULL AND review_id IS NULL
      AND (status<>''approved'' OR due_date IS NOT NULL)))',
  'SELECT 1');
PREPARE gb_report_stmt FROM @gb_report_ddl;
EXECUTE gb_report_stmt;
DEALLOCATE PREPARE gb_report_stmt;
