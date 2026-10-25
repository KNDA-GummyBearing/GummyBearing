-- GummyBearing v9 DB structure / MySQL 8.4 / 2026-10-22
-- 기존 SQL 3개에서 테이블 정의를 그대로 모은 구조 전용 통합 파일입니다.
-- 기존 업무 5개 + 로그인/활동 기록 6개 = 총 11개 테이블.
-- 실제 계정, 비밀번호 해시, 세션, 업무/테스트 데이터는 포함하지 않습니다.
-- 구조 확인 또는 비어 있는 새 연습용 DB에 사용합니다. 운영 DB 재실행용이 아닙니다.
-- DB 이름은 기존 앱과의 호환을 위해 gummybearing_v5_draft를 유지합니다.
-- 별도 MySQL 접속 계정 생성/GRANT는 포함하지 않습니다.

SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS `gummybearing_v5_draft`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;
USE `gummybearing_v5_draft`;

CREATE TABLE `equipment` (
  `equipment_id` VARCHAR(64) NOT NULL COMMENT '설비 ID: EGF-01',
  `equipment_name` VARCHAR(100) NOT NULL COMMENT '설비 이름',
  `tag` VARCHAR(64) NOT NULL COMMENT '설비 태그',
  `equipment_type` VARCHAR(100) NOT NULL COMMENT '설비 유형',
  `process` VARCHAR(32) NOT NULL COMMENT '공정 코드: sinter, steel 등',
  `process_name` VARCHAR(100) NOT NULL COMMENT '공정 표시 이름',
  `plant` VARCHAR(100) NOT NULL COMMENT '공장 이름',
  `area` VARCHAR(200) NOT NULL COMMENT '설비 구역',
  `location` VARCHAR(300) NOT NULL COMMENT 'v5 화면 표시용 위치',
  `monitored_part` VARCHAR(100) NOT NULL COMMENT '감시 부품',
  `bearing_position` VARCHAR(64) NOT NULL COMMENT '베어링 위치',
  `bearing_type` VARCHAR(100) NOT NULL COMMENT '베어링 형식',
  `monitored_signal` VARCHAR(64) NOT NULL COMMENT '감시 신호',
  `sensor_axes` VARCHAR(64) NOT NULL COMMENT 'v5 호환 표시 문자열: 수평;수직',
  `sensor_id` VARCHAR(64) NOT NULL COMMENT '현재 설비당 한 센서 식별자',
  `sampling_interval_min` SMALLINT UNSIGNED NOT NULL COMMENT '샘플 간격(분)',
  `motor_kw` DECIMAL(10,2) NOT NULL COMMENT '모터 정격 출력(kW)',
  `rated_rpm` INT UNSIGNED NOT NULL COMMENT '정격 회전수',
  `load_kn` DECIMAL(10,4) NOT NULL COMMENT '하중(kN)',
  `manager` VARCHAR(100) NOT NULL COMMENT '담당자 표시 이름; 회원 ID 아님',
  `installed_on` DATE NOT NULL COMMENT '설치일',
  `alarm_rule_id` VARCHAR(100) NOT NULL COMMENT '브라우저 판정 규칙의 식별자',
  `data_source` VARCHAR(255) NOT NULL COMMENT '시뮬레이션 원본 설명',
  `data_points` INT UNSIGNED NOT NULL COMMENT '현재 입력 시계열 개수',
  `demo_start_index` INT UNSIGNED NOT NULL COMMENT '시뮬레이션 시작 인덱스',
  `map_label` VARCHAR(8) NOT NULL COMMENT '배치도 라벨 위치: tl/tr/bl/br',
  `map_x_pct` DECIMAL(7,4) NOT NULL COMMENT '배치도 X 백분율',
  `map_y_pct` DECIMAL(7,4) NOT NULL COMMENT '배치도 Y 백분율',
  `h_rms_threshold` DOUBLE NOT NULL COMMENT '수평 RMS 기준값',
  `h_kurtosis_threshold` DOUBLE NOT NULL COMMENT '수평 첨도 기준값',
  `h_peak_threshold` DOUBLE NOT NULL COMMENT '수평 Peak 기준값',
  `v_rms_threshold` DOUBLE NOT NULL COMMENT '수직 RMS 기준값',
  `v_kurtosis_threshold` DOUBLE NOT NULL COMMENT '수직 첨도 기준값',
  `v_peak_threshold` DOUBLE NOT NULL COMMENT '수직 Peak 기준값',
  PRIMARY KEY (`equipment_id`),
  UNIQUE KEY `uq_equipment_tag` (`tag`),
  UNIQUE KEY `uq_equipment_sensor` (`sensor_id`),
  KEY `ix_equipment_process` (`process`),
  CONSTRAINT `ck_equipment_interval` CHECK (`sampling_interval_min` > 0),
  CONSTRAINT `ck_equipment_motor` CHECK (`motor_kw` >= 0),
  CONSTRAINT `ck_equipment_load` CHECK (`load_kn` >= 0),
  CONSTRAINT `ck_equipment_map_x` CHECK (`map_x_pct` BETWEEN 0 AND 100),
  CONSTRAINT `ck_equipment_map_y` CHECK (`map_y_pct` BETWEEN 0 AND 100)
) ENGINE=InnoDB COMMENT='설비 기준정보와 v5 표시·시뮬레이션 설정';

CREATE TABLE `inspections` (
  `inspection_id` VARCHAR(64) NOT NULL COMMENT '점검 ID; 신규 생성은 UUID 방식 권장',
  `equipment_id` VARCHAR(64) NOT NULL COMMENT '점검 대상 설비',
  `inspected_at` DATETIME NOT NULL COMMENT '실제 점검 일시',
  `inspector` VARCHAR(100) NOT NULL COMMENT '점검자 표시 이름',
  `operation_state` VARCHAR(40) NOT NULL COMMENT '운전 상태',
  `noise` VARCHAR(40) NOT NULL COMMENT '소음 상태',
  `noise_memo` TEXT NOT NULL COMMENT '소음 메모; 없으면 빈 문자열',
  `vibration` VARCHAR(40) NOT NULL COMMENT '체감 진동 상태',
  `heat` VARCHAR(40) NOT NULL COMMENT '발열 상태',
  `visual` JSON NOT NULL COMMENT '육안 상태 문자열 배열; 미선택은 []',
  `visual_etc` TEXT NOT NULL COMMENT '기타 육안 상태 설명',
  `need_additional` VARCHAR(40) NOT NULL COMMENT '추가 점검 필요 여부',
  `memo` TEXT NOT NULL COMMENT '점검 메모',
  `model_status` VARCHAR(16) NOT NULL COMMENT '저장 당시 판정 결과; 현재 상태와 구별',
  `decision` VARCHAR(40) NOT NULL COMMENT '계속 관찰/추가 점검/정비 검토',
  `recheck_date` DATE NULL COMMENT '재확인 날짜; 빈 문자열은 NULL로 변환',
  `additional_items` TEXT NOT NULL COMMENT '추가 점검 항목',
  `additional_assignee` VARCHAR(100) NOT NULL COMMENT '추가 점검 담당자; 없으면 빈 문자열',
  `additional_due` DATE NULL COMMENT '추가 점검 날짜; 빈 문자열은 NULL로 변환',
  `created_at` DATETIME NOT NULL COMMENT 'v5 기록 생성 일시',
  `source` VARCHAR(16) NOT NULL DEFAULT 'app' COMMENT 'seed 또는 app',
  PRIMARY KEY (`inspection_id`),
  UNIQUE KEY `uq_inspection_equipment` (`inspection_id`, `equipment_id`),
  KEY `ix_inspection_equipment_time` (`equipment_id`, `inspected_at`),
  CONSTRAINT `fk_inspection_equipment` FOREIGN KEY (`equipment_id`)
    REFERENCES `equipment` (`equipment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_inspection_visual_array` CHECK (JSON_TYPE(`visual`) = 'ARRAY')
) ENGINE=InnoDB COMMENT='설비별 현장 점검 결과';

CREATE TABLE `maintenance_reviews` (
  `review_id` VARCHAR(64) NOT NULL COMMENT '정비 검토 ID',
  `inspection_id` VARCHAR(64) NOT NULL COMMENT '근거 점검 ID',
  `equipment_id` VARCHAR(64) NOT NULL COMMENT '근거 점검과 동일한 설비여야 함',
  `necessity` VARCHAR(40) NOT NULL COMMENT '정비 필요 여부',
  `target` VARCHAR(100) NOT NULL COMMENT '정비 대상 부품',
  `content` TEXT NOT NULL COMMENT '정비 내용',
  `priority` VARCHAR(40) NOT NULL COMMENT '작업 우선도',
  `desired_date` DATE NULL COMMENT '정비 희망일',
  `estimated_hours` DECIMAL(7,2) NULL COMMENT '예상 작업 시간; 미입력은 NULL',
  `work_memo` TEXT NOT NULL COMMENT '작업 메모',
  `review_status` VARCHAR(40) NOT NULL COMMENT '검토 중/정비 완료 등',
  `registered_at` DATETIME NOT NULL COMMENT '검토 등록 일시',
  `source` VARCHAR(16) NOT NULL DEFAULT 'app' COMMENT 'seed 또는 app',
  PRIMARY KEY (`review_id`),
  KEY `ix_review_inspection_equipment` (`inspection_id`, `equipment_id`),
  KEY `ix_review_equipment_time` (`equipment_id`, `registered_at`),
  KEY `ix_review_status_date` (`review_status`, `desired_date`),
  CONSTRAINT `fk_review_inspection_equipment` FOREIGN KEY (`inspection_id`, `equipment_id`)
    REFERENCES `inspections` (`inspection_id`, `equipment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_review_hours` CHECK (`estimated_hours` IS NULL OR `estimated_hours` >= 0)
) ENGINE=InnoDB COMMENT='점검을 근거로 작성한 정비 검토';

CREATE TABLE `follow_ups` (
  `follow_up_id` VARCHAR(64) NOT NULL COMMENT '후속 일정 ID',
  `equipment_id` VARCHAR(64) NOT NULL COMMENT '일정 대상 설비',
  `inspection_id` VARCHAR(64) NULL COMMENT '캘린더 직접 등록은 NULL 가능',
  `type` VARCHAR(40) NOT NULL COMMENT '재확인/추가 점검/정기 점검',
  `due_date` DATE NOT NULL COMMENT '예정일',
  `assignee` VARCHAR(100) NOT NULL COMMENT '담당자 표시 이름',
  `items` TEXT NOT NULL COMMENT '점검 내용',
  `status` VARCHAR(40) NOT NULL COMMENT '예정/완료',
  `created_at` DATETIME NOT NULL COMMENT '일정 생성 일시',
  `source` VARCHAR(16) NOT NULL DEFAULT 'app' COMMENT 'seed 또는 app',
  PRIMARY KEY (`follow_up_id`),
  KEY `ix_followup_inspection_equipment` (`inspection_id`, `equipment_id`),
  KEY `ix_followup_equipment_date` (`equipment_id`, `due_date`),
  KEY `ix_followup_status_date` (`status`, `due_date`),
  CONSTRAINT `fk_followup_equipment` FOREIGN KEY (`equipment_id`)
    REFERENCES `equipment` (`equipment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_followup_inspection_equipment` FOREIGN KEY (`inspection_id`, `equipment_id`)
    REFERENCES `inspections` (`inspection_id`, `equipment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB COMMENT='점검에서 생성하거나 캘린더에 직접 등록한 일정';

CREATE TABLE `work_history` (
  `work_id` VARCHAR(64) NOT NULL COMMENT '과거 정비 이력 ID',
  `equipment_id` VARCHAR(64) NOT NULL COMMENT '정비 대상 설비',
  `work_date` DATE NOT NULL COMMENT '작업 날짜',
  `work_type` VARCHAR(100) NOT NULL COMMENT '작업 구분',
  `anomaly` TEXT NOT NULL COMMENT '이상 내용',
  `repeat_anomaly` CHAR(1) NOT NULL COMMENT '반복 이상 여부 Y/N',
  `action` TEXT NOT NULL COMMENT '조치 내용',
  `result` TEXT NOT NULL COMMENT '작업 결과',
  `worker` VARCHAR(100) NOT NULL COMMENT '작업자 표시; 여러 명을 포함할 수 있음',
  `downtime_h` DECIMAL(8,2) NOT NULL COMMENT '정지 시간(시간)',
  `source` VARCHAR(16) NOT NULL DEFAULT 'app' COMMENT 'seed 또는 app',
  PRIMARY KEY (`work_id`),
  KEY `ix_history_equipment_date` (`equipment_id`, `work_date`),
  CONSTRAINT `fk_history_equipment` FOREIGN KEY (`equipment_id`)
    REFERENCES `equipment` (`equipment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_history_repeat` CHECK (`repeat_anomaly` IN ('Y', 'N')),
  CONSTRAINT `ck_history_downtime` CHECK (`downtime_h` >= 0)
) ENGINE=InnoDB COMMENT='과거 정비 조치 사례; v5에는 점검/검토 연결 ID가 없음';

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

CREATE TABLE IF NOT EXISTS gb_followup_authors (
 follow_up_id VARCHAR(64) NOT NULL PRIMARY KEY,
 username VARCHAR(64) NOT NULL,
 created_at DATETIME NOT NULL,
 KEY ix_gb_followup_authors_user (username,created_at),
 FOREIGN KEY(follow_up_id) REFERENCES follow_ups(follow_up_id) ON DELETE RESTRICT,
 FOREIGN KEY(username) REFERENCES gb_users(username) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
