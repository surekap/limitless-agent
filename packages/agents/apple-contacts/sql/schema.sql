-- Apple Contacts integration — adds two columns to relationships.contacts
-- Idempotent: safe to run multiple times

ALTER TABLE relationships.contacts
  ADD COLUMN IF NOT EXISTS apple_contact_id TEXT;

ALTER TABLE relationships.contacts
  ADD COLUMN IF NOT EXISTS avatar_data TEXT; -- base64-encoded JPEG

CREATE INDEX IF NOT EXISTS contacts_apple_contact_id_idx
  ON relationships.contacts (apple_contact_id)
  WHERE apple_contact_id IS NOT NULL;
