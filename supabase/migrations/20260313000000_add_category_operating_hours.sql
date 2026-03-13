-- Add operating hours columns to categories table
ALTER TABLE categories ADD COLUMN IF NOT EXISTS start_time TIME DEFAULT NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS end_time TIME DEFAULT NULL;

COMMENT ON COLUMN categories.start_time IS 'Category availability start time (HH:MM in PHT). NULL = always available.';
COMMENT ON COLUMN categories.end_time IS 'Category availability end time (HH:MM in PHT). NULL = always available.';
