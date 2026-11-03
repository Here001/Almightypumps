-- Bumped on password change / "log out of all devices"; sessions signed with an older value stop working.
ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0;
