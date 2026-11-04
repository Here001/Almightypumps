-- Referral program: every customer gets an invite code; a friend who signs up with it is linked to them.
-- Once the friend has spent the minimum (paid orders), both get the bonuses from app_settings `referrals`.
ALTER TABLE users ADD COLUMN referral_code text UNIQUE;
ALTER TABLE users ADD COLUMN referred_by uuid REFERENCES users(id);

CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES users(id),
  referred_id uuid NOT NULL UNIQUE REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'void')),
  reward_kobo bigint,                    -- paid to the referrer
  friend_reward_kobo bigint,             -- paid to the friend
  note text,                             -- why it was voided / not paid
  rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referrals_referrer_idx ON referrals (referrer_id, created_at DESC);
CREATE INDEX referrals_pending_idx ON referrals (status) WHERE status = 'pending';
