-- W7 F33: an authorized Customer phone change invalidates undispatched
-- encrypted outbound payloads for that organization and Customer.
-- Forward-only: retain 086-091 checksums and never persist plaintext phone.
CREATE FUNCTION outbound_suppress_customer_phone_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE r record;
BEGIN
  IF TG_OP<>'UPDATE' OR TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'customers' THEN
    RAISE EXCEPTION 'OUTBOUND_CUSTOMER_TRIGGER_SCOPE' USING ERRCODE='23514';
  END IF;
  IF OLD.phone_normalized IS NOT DISTINCT FROM NEW.phone_normalized THEN
    RETURN NEW;
  END IF;

  -- Customer already locked. Follow the sender permit Customer -> Delivery
  -- lock order; claims lock only Delivery, released on claim COMMIT.
  FOR r IN
    SELECT d.id,d.intent_id
      FROM outbound_message_deliveries d
      JOIN outbound_message_intents i
        ON i.id=d.intent_id AND i.organization_id=d.organization_id
     WHERE i.organization_id=OLD.organization_id AND i.customer_id=OLD.id
       AND d.state IN ('PENDING','LEASED','RETRY_WAIT')
     ORDER BY d.created_at,d.id FOR UPDATE OF d
  LOOP
    UPDATE outbound_message_deliveries SET state='SUPPRESSED',
      terminal_reason='REVOKED',next_attempt_at=NULL,
      lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
      WHERE id=r.id AND state IN ('PENDING','LEASED','RETRY_WAIT');
    DELETE FROM outbound_message_envelopes WHERE intent_id=r.intent_id;
  END LOOP;
  -- DISPATCHING crossed the irreversible transport boundary: never assert
  -- NOT_SENT or requeue. The 091 recovery will settle ACCEPTED/UNKNOWN.
  RETURN NEW;
END $$;

CREATE TRIGGER outbound_customer_phone_change
AFTER UPDATE OF phone_normalized ON public.customers
FOR EACH ROW
WHEN (OLD.phone_normalized IS DISTINCT FROM NEW.phone_normalized)
EXECUTE FUNCTION outbound_suppress_customer_phone_change();

REVOKE ALL ON FUNCTION outbound_suppress_customer_phone_change() FROM PUBLIC;
