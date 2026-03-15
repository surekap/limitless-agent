-- Idempotent schema for the email agent
-- Uses the 'email' schema within the shared secondbrain database

CREATE SCHEMA IF NOT EXISTS email;

CREATE TABLE IF NOT EXISTS email.accounts (
    id             SERIAL PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    last_synced_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS email.emails (
    id             SERIAL PRIMARY KEY,
    account_id     INTEGER NOT NULL REFERENCES email.accounts(id) ON DELETE CASCADE,
    message_id     TEXT,
    gmail_uid      BIGINT NOT NULL,
    thread_id      TEXT,
    subject        TEXT,
    from_address   TEXT,
    to_addresses   TEXT[],
    cc_addresses   TEXT[],
    bcc_addresses  TEXT[],
    reply_to       TEXT,
    date           TIMESTAMPTZ,
    received_at    TIMESTAMPTZ,
    body_text      TEXT,
    body_html      TEXT,
    raw_headers    JSONB,
    attachments    JSONB,
    labels         TEXT[],
    is_read        BOOLEAN DEFAULT FALSE,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (account_id, gmail_uid)
);

CREATE INDEX IF NOT EXISTS idx_email_emails_account_id ON email.emails (account_id);
CREATE INDEX IF NOT EXISTS idx_email_emails_message_id ON email.emails (message_id);
CREATE INDEX IF NOT EXISTS idx_email_emails_gmail_uid  ON email.emails (gmail_uid);
CREATE INDEX IF NOT EXISTS idx_email_emails_date       ON email.emails (date);
CREATE INDEX IF NOT EXISTS idx_email_emails_is_read    ON email.emails (is_read);
