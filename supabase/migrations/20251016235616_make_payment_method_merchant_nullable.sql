-- Make merchant_id nullable in payment_methods table
-- This allows payment methods to be shared across all merchants

ALTER TABLE payment_methods 
ALTER COLUMN merchant_id DROP NOT NULL;

-- Add comment explaining the nullable merchant_id
COMMENT ON COLUMN payment_methods.merchant_id IS 'Merchant this payment method belongs to. NULL means available for all merchants.';

-- Update existing policies to handle NULL merchant_id
DROP POLICY IF EXISTS "Anyone can read active payment methods" ON payment_methods;

CREATE POLICY "Anyone can read active payment methods"
  ON payment_methods
  FOR SELECT
  TO public
  USING (active = true);
