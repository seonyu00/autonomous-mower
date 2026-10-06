-- 기존 계정의 ID·해시·역할·생성 시각을 보존하며 강제 비밀번호 변경을 적용하지 않는다.
ALTER TABLE admin_account
    ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN session_version BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN updated_at TIMESTAMP;

UPDATE admin_account SET updated_at = created_at;
ALTER TABLE admin_account ALTER COLUMN updated_at SET NOT NULL;
-- 기존 SQL 기반 최초 관리자 등록도 수정 시각을 누락해 실패하지 않도록 한다.
ALTER TABLE admin_account ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

-- 마지막 관리자 검사와 계정 쓰기를 서버 인스턴스에 관계없이 직렬화한다.
CREATE TABLE account_management_guard (id INTEGER PRIMARY KEY CHECK (id = 1));
INSERT INTO account_management_guard (id) VALUES (1);

CREATE TABLE account_audit (
    id VARCHAR(255) PRIMARY KEY,
    actor_id VARCHAR(50) NOT NULL,
    target_id VARCHAR(50) NOT NULL,
    action VARCHAR(30) NOT NULL,
    previous_role VARCHAR(20),
    new_role VARCHAR(20),
    previous_enabled BOOLEAN,
    new_enabled BOOLEAN,
    occurred_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_account_audit_time ON account_audit (occurred_at DESC, id);
