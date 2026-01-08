-- Supabase Database Schema for Gokul Restaurant Management System
-- This schema replaces the SQLite database with Supabase PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Real-time for all tables
-- Run this in Supabase Dashboard: Database > Replication

-- ===== USERS & AUTHENTICATION =====

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('staff', 'kitchen', 'owner')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff permissions table
CREATE TABLE public.staff_permissions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  staff_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  can_view_all_orders BOOLEAN DEFAULT FALSE,
  allowed_staff_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== MENU =====

CREATE TABLE public.menu (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== ORDERS =====

CREATE TABLE public.orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  table_id INTEGER NOT NULL,
  staff_id UUID REFERENCES public.users(id),
  staff_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'ready', 'completed', 'cancelled')),
  total DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.order_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== KITCHEN ORDERS =====

CREATE TABLE public.kitchen_orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  batch_id INTEGER NOT NULL,
  staff_id UUID REFERENCES public.users(id),
  staff_name TEXT NOT NULL,
  table_id INTEGER NOT NULL,
  items JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'preparing', 'ready', 'served')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  ready_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== BILLS =====

CREATE TABLE public.bills (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id),
  bill_number TEXT UNIQUE NOT NULL,
  table_id INTEGER NOT NULL,
  staff_id UUID REFERENCES public.users(id),
  staff_name TEXT NOT NULL,
  items JSONB NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  tax DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== SETTINGS =====

CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== AUDIT LOGS =====

CREATE TABLE public.audit_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id),
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== NOTIFICATIONS =====

CREATE TABLE public.notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id),
  type TEXT NOT NULL CHECK (type IN ('order', 'kitchen', 'permission', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== INDEXES =====

CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_orders_staff_id ON public.orders(staff_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_kitchen_orders_status ON public.kitchen_orders(status);
CREATE INDEX idx_kitchen_orders_sent_at ON public.kitchen_orders(sent_at DESC);
CREATE INDEX idx_bills_created_at ON public.bills(created_at DESC);
CREATE INDEX idx_bills_staff_id ON public.bills(staff_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- ===== ROW LEVEL SECURITY (RLS) =====

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Owners can view all users" ON public.users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

-- Menu policies (everyone can read, only owners can modify)
CREATE POLICY "Anyone can view menu" ON public.menu
  FOR SELECT USING (TRUE);

CREATE POLICY "Only owners can insert menu items" ON public.menu
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Only owners can update menu items" ON public.menu
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Only owners can delete menu items" ON public.menu
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

-- Orders policies
CREATE POLICY "Staff can view their own orders" ON public.orders
  FOR SELECT USING (
    staff_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('owner', 'kitchen'))
  );

CREATE POLICY "Staff can create orders" ON public.orders
  FOR INSERT WITH CHECK (
    staff_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Staff can update their own orders" ON public.orders
  FOR UPDATE USING (
    staff_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('owner', 'kitchen'))
  );

-- Kitchen orders policies
CREATE POLICY "Kitchen and owners can view all kitchen orders" ON public.kitchen_orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('owner', 'kitchen', 'staff'))
  );

CREATE POLICY "Staff and owners can create kitchen orders" ON public.kitchen_orders
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('owner', 'staff'))
  );

CREATE POLICY "Kitchen and owners can update kitchen orders" ON public.kitchen_orders
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('owner', 'kitchen'))
  );

-- Bills policies
CREATE POLICY "Staff can view their own bills" ON public.bills
  FOR SELECT USING (
    staff_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Staff and owners can create bills" ON public.bills
  FOR INSERT WITH CHECK (
    staff_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

-- Settings policies (only owners)
CREATE POLICY "Only owners can view settings" ON public.settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Only owners can modify settings" ON public.settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

-- Audit logs policies (only owners can view)
CREATE POLICY "Only owners can view audit logs" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

-- Notifications policies
CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

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
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_permissions_updated_at BEFORE UPDATE ON public.staff_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_updated_at BEFORE UPDATE ON public.menu
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kitchen_orders_updated_at BEFORE UPDATE ON public.kitchen_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create audit log
-- Note: Uses SECURITY DEFINER to ensure audit logs are created even if
-- the triggering user doesn't have direct INSERT permission on audit_logs.
-- This is necessary for proper audit trail functionality.
-- Security: Only accessible via triggers, not directly callable by users.
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Audit triggers for important tables
CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION create_audit_log();

CREATE TRIGGER audit_bills AFTER INSERT OR UPDATE OR DELETE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION create_audit_log();

CREATE TRIGGER audit_staff_permissions AFTER INSERT OR UPDATE OR DELETE ON public.staff_permissions
  FOR EACH ROW EXECUTE FUNCTION create_audit_log();

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
-- 1. Enable replication for tables: orders, kitchen_orders, notifications, staff_permissions
-- 2. Or run: ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
-- 3. ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_orders;
-- 4. ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
-- 5. ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_permissions;
