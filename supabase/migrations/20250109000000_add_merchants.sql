-- Migration: Add Multi-Merchant Support
-- This migration transforms the single-restaurant app into a multi-merchant marketplace

-- Create merchants table
CREATE TABLE IF NOT EXISTS merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  logo_url text,
  cover_image_url text,
  category text NOT NULL, -- e.g., 'restaurant', 'cafe', 'bakery', 'fast-food'
  cuisine_type text, -- e.g., 'Filipino', 'Chinese', 'Italian', 'American'
  delivery_fee decimal(10,2) DEFAULT 0,
  minimum_order decimal(10,2) DEFAULT 0,
  estimated_delivery_time text, -- e.g., '30-45 mins'
  rating decimal(3,2) DEFAULT 0, -- 0-5 stars
  total_reviews integer DEFAULT 0,
  active boolean DEFAULT true,
  featured boolean DEFAULT false, -- Show on homepage
  address text,
  contact_number text,
  email text,
  opening_hours jsonb, -- Store opening hours as JSON
  payment_methods text[], -- Array of accepted payment methods
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add merchant_id to menu_items
ALTER TABLE menu_items 
ADD COLUMN merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE;

-- Add merchant_id to categories
ALTER TABLE categories 
ADD COLUMN merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE;

-- Add merchant_id to orders
ALTER TABLE orders 
ADD COLUMN merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE;

-- Add merchant_id to payment_methods
ALTER TABLE payment_methods 
ADD COLUMN merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE;

-- Create indexes for better query performance
CREATE INDEX idx_menu_items_merchant_id ON menu_items(merchant_id);
CREATE INDEX idx_categories_merchant_id ON categories(merchant_id);
CREATE INDEX idx_orders_merchant_id ON orders(merchant_id);
CREATE INDEX idx_payment_methods_merchant_id ON payment_methods(merchant_id);
CREATE INDEX idx_merchants_active ON merchants(active);
CREATE INDEX idx_merchants_featured ON merchants(featured);
CREATE INDEX idx_merchants_category ON merchants(category);

-- Enable RLS
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

-- Create policies for merchants
CREATE POLICY "Anyone can read active merchants"
  ON merchants
  FOR SELECT
  TO public
  USING (active = true);

CREATE POLICY "Authenticated users can manage merchants"
  ON merchants
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create updated_at trigger for merchants
CREATE TRIGGER update_merchants_updated_at
  BEFORE UPDATE ON merchants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert a default merchant for existing data
-- This ensures existing menu items don't break
INSERT INTO merchants (name, description, category, cuisine_type, active, featured)
VALUES (
  'ClickEats Main Store',
  'Our flagship restaurant offering a wide variety of delicious meals',
  'restaurant',
  'Filipino',
  true,
  true
);

-- Update existing menu items to belong to the default merchant
UPDATE menu_items 
SET merchant_id = (SELECT id FROM merchants WHERE name = 'ClickEats Main Store' LIMIT 1)
WHERE merchant_id IS NULL;

-- Update existing categories to belong to the default merchant
UPDATE categories 
SET merchant_id = (SELECT id FROM merchants WHERE name = 'ClickEats Main Store' LIMIT 1)
WHERE merchant_id IS NULL;

-- Update existing payment methods to belong to the default merchant
UPDATE payment_methods 
SET merchant_id = (SELECT id FROM merchants WHERE name = 'ClickEats Main Store' LIMIT 1)
WHERE merchant_id IS NULL;

-- Make merchant_id NOT NULL after setting defaults
ALTER TABLE menu_items 
ALTER COLUMN merchant_id SET NOT NULL;

ALTER TABLE categories 
ALTER COLUMN merchant_id SET NOT NULL;

ALTER TABLE payment_methods 
ALTER COLUMN merchant_id SET NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE merchants IS 'Stores information about different merchants/stores in the marketplace';
COMMENT ON COLUMN merchants.opening_hours IS 'JSON object with opening hours, e.g., {"monday": "09:00-22:00", "tuesday": "09:00-22:00"}';
COMMENT ON COLUMN merchants.payment_methods IS 'Array of accepted payment methods, e.g., ["gcash", "maya", "cash"]';

