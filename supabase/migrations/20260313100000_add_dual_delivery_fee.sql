-- Add fixed delivery fee to merchants (for economy mode)
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS fixed_delivery_fee numeric NOT NULL DEFAULT 0
  CONSTRAINT fixed_delivery_fee_non_negative CHECK (fixed_delivery_fee >= 0);

-- Add delivery mode to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'priority'
  CONSTRAINT delivery_mode_valid CHECK (delivery_mode IN ('priority', 'economy'));
