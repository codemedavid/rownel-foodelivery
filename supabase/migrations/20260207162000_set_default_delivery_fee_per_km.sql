-- Set per-km delivery fee baseline to 4 and backfill unset merchants

ALTER TABLE merchants
  ALTER COLUMN delivery_fee_per_km SET DEFAULT 4;

UPDATE merchants
SET delivery_fee_per_km = 4
WHERE delivery_fee_per_km IS NULL OR delivery_fee_per_km = 0;
