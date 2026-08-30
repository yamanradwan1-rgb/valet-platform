ALTER TABLE "web_push_subscriptions"
ADD CONSTRAINT "web_push_subscriptions_envelope_key_version_check" CHECK (
  CASE
    WHEN "disabled_at" IS NULL THEN
      ("endpoint_ciphertext"::jsonb ->> 'keyVersion') = "encryption_key_version"
      AND ("p256dh_ciphertext"::jsonb ->> 'keyVersion') = "encryption_key_version"
      AND ("auth_ciphertext"::jsonb ->> 'keyVersion') = "encryption_key_version"
    ELSE TRUE
  END
);
