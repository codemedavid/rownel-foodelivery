/*
  # Add Promotions Carousel Management

  1. New Tables
    - `promotions`
      - `id` (uuid, primary key)
      - `title` (text)
      - `subtitle` (text)
      - `cta_text` (text)
      - `cta_link` (text)
      - `banner_image_url` (text)
      - `active` (boolean)
      - `sort_order` (integer)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on promotions table
    - Public read for active promotions
    - Authenticated users can manage promotions
*/

CREATE TABLE IF NOT EXISTS promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  cta_text text,
  cta_link text,
  banner_image_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotions_active_sort
  ON promotions(active, sort_order, created_at);

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active promotions" ON promotions;
CREATE POLICY "Anyone can read active promotions"
  ON promotions
  FOR SELECT
  TO public
  USING (active = true);

DROP POLICY IF EXISTS "Authenticated users can manage promotions" ON promotions;
CREATE POLICY "Authenticated users can manage promotions"
  ON promotions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_promotions_updated_at ON promotions;
CREATE TRIGGER update_promotions_updated_at
  BEFORE UPDATE ON promotions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

INSERT INTO promotions (title, subtitle, cta_text, cta_link, banner_image_url, active, sort_order)
VALUES
  ('Spicy Zone', 'Up to 40% OFF', 'Order Now', '/', 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1400', true, 1),
  ('Weekend Bundle', 'Free delivery on orders above ₱499', 'Shop Deals', '/', 'https://images.pexels.com/photos/4551832/pexels-photo-4551832.jpeg?auto=compress&cs=tinysrgb&w=1400', true, 2)
ON CONFLICT DO NOTHING;
