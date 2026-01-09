-- Simplified Supabase Database Schema for Gokul Restaurant Management System
-- This schema works without Supabase Auth, using simple name-based authentication
-- Perfect for the browser-based PWA implementation

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== STAFF (No Supabase Auth required) =====

CREATE TABLE IF NOT EXISTS public.staff (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff permissions table
CREATE TABLE IF NOT EXISTS public.staff_permissions (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT REFERENCES public.staff(id) ON DELETE CASCADE,
  can_view_other_orders BOOLEAN DEFAULT FALSE,
  allowed_staff_ids BIGINT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== MENU =====

CREATE TABLE IF NOT EXISTS public.menu (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== ORDERS =====

CREATE TABLE IF NOT EXISTS public.orders (
  id BIGSERIAL PRIMARY KEY,
  table_id INTEGER NOT NULL,
  staff_id BIGINT REFERENCES public.staff(id),
  staff_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'ready', 'completed', 'cancelled')),
  total DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES public.orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== KITCHEN ORDERS =====

CREATE TABLE IF NOT EXISTS public.kitchen_orders (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES public.orders(id) ON DELETE CASCADE,
  batch_id INTEGER NOT NULL,
  staff_name TEXT NOT NULL,
  table_id INTEGER NOT NULL,
  items JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'collected', 'served')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  ready_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== BILLS =====

CREATE TABLE IF NOT EXISTS public.bills (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES public.orders(id),
  bill_number TEXT UNIQUE NOT NULL,
  table_id INTEGER NOT NULL,
  staff_name TEXT NOT NULL,
  items JSONB NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  tax DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== SETTINGS =====

CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== INDEXES =====

CREATE INDEX IF NOT EXISTS idx_staff_name ON public.staff(name);
CREATE INDEX IF NOT EXISTS idx_orders_staff_name ON public.orders(staff_name);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON public.orders(table_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_status ON public.kitchen_orders(status);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_sent_at ON public.kitchen_orders(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_table_id ON public.kitchen_orders(table_id);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON public.bills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_staff_name ON public.bills(staff_name);

-- ===== ROW LEVEL SECURITY (RLS) =====
-- Disable RLS for this simple implementation (browser-based app)
-- Enable if you want to add proper authentication later

ALTER TABLE public.staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings DISABLE ROW LEVEL SECURITY;

-- ===== FUNCTIONS =====

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_staff_permissions_updated_at ON public.staff_permissions;
CREATE TRIGGER update_staff_permissions_updated_at BEFORE UPDATE ON public.staff_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_menu_updated_at ON public.menu;
CREATE TRIGGER update_menu_updated_at BEFORE UPDATE ON public.menu
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_kitchen_orders_updated_at ON public.kitchen_orders;
CREATE TRIGGER update_kitchen_orders_updated_at BEFORE UPDATE ON public.kitchen_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_settings_updated_at ON public.settings;
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== ANALYTICS FUNCTIONS =====

-- Get staff performance
CREATE OR REPLACE FUNCTION get_staff_performance()
RETURNS TABLE (
  staff_name TEXT,
  order_count BIGINT,
  total_revenue DECIMAL,
  avg_order_value DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.staff_name,
    COUNT(o.id)::BIGINT as order_count,
    COALESCE(SUM(o.total), 0) as total_revenue,
    COALESCE(AVG(o.total), 0) as avg_order_value
  FROM public.orders o
  WHERE o.status = 'completed'
  GROUP BY o.staff_name
  ORDER BY total_revenue DESC;
END;
$$ LANGUAGE plpgsql;

-- Get popular items
CREATE OR REPLACE FUNCTION get_popular_items()
RETURNS TABLE (
  item_name TEXT,
  total_quantity BIGINT,
  order_count BIGINT,
  total_revenue DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    oi.item_name,
    SUM(oi.quantity)::BIGINT as total_quantity,
    COUNT(DISTINCT oi.order_id)::BIGINT as order_count,
    SUM(oi.quantity * oi.price) as total_revenue
  FROM public.order_items oi
  JOIN public.orders o ON oi.order_id = o.id
  WHERE o.status = 'completed'
  GROUP BY oi.item_name
  ORDER BY total_quantity DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Get daily sales
CREATE OR REPLACE FUNCTION get_daily_sales(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  date DATE,
  order_count BIGINT,
  total_revenue DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(o.created_at) as date,
    COUNT(o.id)::BIGINT as order_count,
    COALESCE(SUM(o.total), 0) as total_revenue
  FROM public.orders o
  WHERE o.status = 'completed'
    AND o.created_at >= NOW() - (days_back || ' days')::INTERVAL
  GROUP BY DATE(o.created_at)
  ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql;

-- Get hourly sales (today)
CREATE OR REPLACE FUNCTION get_hourly_sales()
RETURNS TABLE (
  hour INTEGER,
  order_count BIGINT,
  total_revenue DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(HOUR FROM o.created_at)::INTEGER as hour,
    COUNT(o.id)::BIGINT as order_count,
    COALESCE(SUM(o.total), 0) as total_revenue
  FROM public.orders o
  WHERE o.status = 'completed'
    AND DATE(o.created_at) = CURRENT_DATE
  GROUP BY EXTRACT(HOUR FROM o.created_at)
  ORDER BY hour;
END;
$$ LANGUAGE plpgsql;

-- ===== DEFAULT DATA =====

-- Insert default settings
INSERT INTO public.settings (key, value) VALUES
  ('num_tables', '4'),
  ('restaurant_name', 'Gokul Restaurant'),
  ('tax_rate', '0')
ON CONFLICT (key) DO NOTHING;

-- Insert default menu items
INSERT INTO public.menu (category, name, price) VALUES
  ('Appetizers', 'Samosa', 8.00),
  ('Appetizers', 'French Fries', 50.00),
  ('Appetizers', 'Chilli Potato', 60.00),
  ('Appetizers', 'Honey Chilli Potato', 70.00),
  ('Breads', 'Idly', 50.00),
  ('Breads', 'Veg Momos', 50.00),
  ('Breads', 'Veg Fried Momos', 70.00),
  ('Main Course', 'Paneer Momos', 80.00),
  ('Main Course', 'Paneer Fried Momos', 100.00),
  ('Main Course', 'Chilli Paneer (Half)', 80.00),
  ('Main Course', 'Chilli Paneer (Full)', 150.00),
  ('Main Course', 'Gokul Thali', 100.00),
  ('Main Course', 'Gokul Special Thali', 140.00),
  ('Main Course', 'Chowmein (Half)', 50.00),
  ('Main Course', 'Chowmein (Full)', 90.00),
  ('Main Course', 'Biryani (Half)', 120.00),
  ('Main Course', 'Biryani (Full)', 180.00)
ON CONFLICT DO NOTHING;

-- ===== ENABLE REALTIME =====
-- Run these commands in Supabase Dashboard > Database > Replication:
-- Enable replication for these tables:
-- 1. orders
-- 2. kitchen_orders
-- 3. staff_permissions
-- 4. settings

-- Or run SQL commands:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_orders;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_permissions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;

-- ===== SETUP COMPLETE =====
-- Your Supabase database is now ready for the Gokul Restaurant Management App!
-- 
-- Next steps:
-- 1. Copy your Supabase URL and Anon Key
-- 2. Add them as GitHub Secrets (SUPABASE_URL and SUPABASE_ANON_KEY)
-- 3. Enable Realtime for the tables listed above in Supabase Dashboard
-- 4. Deploy your application!
