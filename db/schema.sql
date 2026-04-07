-- PMO Customer/People Management — MySQL 8.0+
-- Charset: utf8mb4 (đầy đủ Unicode, emoji trong JSON nếu cần)

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Vai trò cố định (tham chiếu); có thể mở rộng bằng INSERT
CREATE TABLE IF NOT EXISTS roles (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE COMMENT 'pm | director | admin',
  label VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO roles (id, code, label) VALUES
  (1, 'pm', 'Project Manager'),
  (2, 'director', 'Director'),
  (3, 'admin', 'Administrator');

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  role_id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role_id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Báo cáo checklist + phân tích AI (payload đầy đủ để audit / tái hiển thị)
CREATE TABLE IF NOT EXISTS reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'Người gửi (PM đăng nhập)',
  week INT NOT NULL COMMENT 'Số tuần trong năm (logic app)',
  pm_label VARCHAR(240) NOT NULL COMMENT 'Tên PM trên form',
  project VARCHAR(240) NOT NULL,
  division VARCHAR(120) NULL,
  payload_json JSON NOT NULL COMMENT 'Toàn bộ form + metadata đã sanitize',
  analysis_json JSON NOT NULL COMMENT 'Kết quả Claude',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_reports_week (week),
  KEY idx_reports_user_week (user_id, week),
  KEY idx_reports_created (created_at),
  CONSTRAINT fk_reports_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nhật ký thao tác — tracking / compliance (đăng nhập, gửi báo cáo, BOD, v.v.)
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL COMMENT 'login | register | submit_report | bod | ...',
  entity_type VARCHAR(64) NOT NULL DEFAULT 'system',
  entity_id VARCHAR(64) NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(512) NULL,
  meta_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_user (user_id),
  KEY idx_audit_action (action),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
