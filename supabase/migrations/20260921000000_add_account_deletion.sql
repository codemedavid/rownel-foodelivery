/*
  Customer account deletion.

  App Store Review Guideline 5.1.1(v) requires any app that lets a customer
  create an account to let them delete it from inside the app. The mobile app
  registers customers only (app/(tabs)/profile.tsx), so this covers the accounts
  it can create.

  Two things have to happen, and the order is load-bearing:

    1. Scrub the personal details denormalised onto the customer's orders.
       orders.customer_user_id is ON DELETE SET NULL, so once the auth row is
       gone there is no way left to find which orders were theirs. The scrub
       therefore runs first, inside the same transaction.

    2. Delete the auth row. customers, push tokens and notifications all carry
       ON DELETE CASCADE, so they go with it.

  The order rows themselves are kept, with their totals, line items and dates
  intact: they are accounting records, and the Philippine tax code requires
  keeping them. What is removed is everything that ties a row to a person.

  A rider is refused rather than deleted — their rows cascade into earnings and
  dispatch history, which is financial data that must not disappear on a tap.
  Riders do not register in the mobile app, so this does not affect the
  guideline above.
*/

CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF EXISTS (SELECT 1 FROM riders WHERE rider_id = v_uid) THEN
    RAISE EXCEPTION 'Rider accounts cannot be deleted in the app. Contact support.';
  END IF;

  -- customer_name and contact_number are NOT NULL, so they are overwritten
  -- rather than nulled.
  UPDATE orders
     SET customer_name  = 'Deleted account',
         contact_number = '',
         address        = NULL,
         notes          = NULL
   WHERE customer_user_id = v_uid;

  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM public;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;

COMMENT ON FUNCTION delete_my_account() IS
  'Deletes the signed-in customer''s account and scrubs the personal details on their past orders, keeping the orders themselves as accounting records.';
