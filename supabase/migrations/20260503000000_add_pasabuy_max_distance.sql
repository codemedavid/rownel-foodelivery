-- Add per-merchant radius cap for Pasabuy (economy/PASABAY) delivery mode.
-- Null means fall back to max_delivery_distance_km.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS pasabuy_max_distance_km numeric NULL
  CONSTRAINT pasabuy_max_distance_km_positive CHECK (pasabuy_max_distance_km IS NULL OR pasabuy_max_distance_km > 0);
