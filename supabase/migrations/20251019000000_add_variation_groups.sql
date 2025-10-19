/*
  # Add Variation Groups Support
  
  This migration adds support for grouped variations, allowing items to have
  multiple types of variations (e.g., Size, Temperature, Style).
  
  Changes:
  1. Add variation_group column to variations table
  2. Add sort_order column for ordering variations within groups
  3. Add required flag to indicate if customer must select from this group
  
  Examples:
  - Coffee:
    - Size (required): Small (+₱0), Medium (+₱20), Large (+₱40)
    - Temperature (required): Hot (+₱0), Iced (+₱10)
    - Milk Type (optional): Regular (+₱0), Oat (+₱20), Almond (+₱25)
  
  - Fries:
    - Size (required): Regular (+₱0), Large (+₱30)
    - Style (optional): Straight (+₱0), Curly (+₱15), Waffle (+₱20)
*/

-- Add variation_group column to variations table
DO $$
BEGIN
  -- Add variation_group column (defaults to 'default' for existing variations)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'variations' AND column_name = 'variation_group'
  ) THEN
    ALTER TABLE variations ADD COLUMN variation_group text NOT NULL DEFAULT 'default';
  END IF;

  -- Add sort_order column for ordering variations within a group
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'variations' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE variations ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Create a new table for variation group metadata
CREATE TABLE IF NOT EXISTS variation_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL, -- e.g., "Size", "Temperature", "Style"
  required boolean DEFAULT true, -- If true, customer must select one option
  sort_order integer NOT NULL DEFAULT 0, -- Order of groups in UI
  created_at timestamptz DEFAULT now()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_variation_groups_menu_item_id ON variation_groups(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_variations_variation_group ON variations(variation_group);

-- Enable RLS on variation_groups table
ALTER TABLE variation_groups ENABLE ROW LEVEL SECURITY;

-- Create policies for variation_groups
CREATE POLICY "Anyone can read variation groups"
  ON variation_groups
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can manage variation groups"
  ON variation_groups
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Update existing variations to have sort_order based on creation time
UPDATE variations 
SET sort_order = EXTRACT(EPOCH FROM created_at)::integer 
WHERE sort_order = 0;

-- Comment on new columns for documentation
COMMENT ON COLUMN variations.variation_group IS 'The group/type this variation belongs to (e.g., "Size", "Temperature", "Style")';
COMMENT ON COLUMN variations.sort_order IS 'Order of this variation within its group (lower numbers appear first)';
COMMENT ON TABLE variation_groups IS 'Metadata for variation groups, including whether selection is required';

