// Direct Supabase API Client for Browser
// This replaces the Node.js backend with direct Supabase calls

// Utility function for generating staff emails
function generateStaffEmail(name) {
  const sanitized = name.toLowerCase()
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, '.');
  return `${sanitized}@gokul-staff.local`;
}

class SupabaseAPIClient {
  constructor() {
    this.supabase = null;
    this.subscriptions = [];
    this.eventHandlers = {};
    this.connected = false;
    this.initPromise = null;
  }

  // Initialize Supabase connection
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise(async (resolve) => {
      // Wait for Supabase client to be initialized
      if (window.supabaseClient && window.supabaseClient.initSupabase) {
        this.supabase = await window.supabaseClient.initSupabase();
        
        if (this.supabase) {
          this.connected = true;
          console.log('✅ Supabase API Client connected');
          this.emit('connected');
          
          // Setup real-time subscriptions
          await this.setupRealtimeSubscriptions();
        } else {
          console.warn('⚠️ Supabase not configured - using localStorage fallback');
          this.connected = false;
        }
      }
      resolve(this.supabase !== null);
    });

    return this.initPromise;
  }

  // Setup real-time subscriptions for live updates
  async setupRealtimeSubscriptions() {
    if (!this.supabase) return;

    try {
      // Subscribe to menu changes
      const menuChannel = this.supabase
        .channel('menu_changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'menu'
        }, (payload) => {
          console.log('Menu changed:', payload);
          this.emit('menu_updated', payload.new);
        })
        .subscribe();
      
      this.subscriptions.push(menuChannel);

      // Subscribe to orders changes
      const ordersChannel = this.supabase
        .channel('orders_changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'orders'
        }, (payload) => {
          console.log('Order changed:', payload);
          if (payload.eventType === 'INSERT') {
            this.emit('order_created', payload.new);
          } else if (payload.eventType === 'UPDATE') {
            this.emit('order_updated', payload.new);
          }
        })
        .subscribe();
      
      this.subscriptions.push(ordersChannel);

      // Subscribe to kitchen orders changes
      const kitchenChannel = this.supabase
        .channel('kitchen_orders_changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'kitchen_orders'
        }, (payload) => {
          console.log('Kitchen order changed:', payload);
          if (payload.eventType === 'INSERT') {
            this.emit('kitchen_order_created', payload.new);
          } else if (payload.eventType === 'UPDATE') {
            this.emit('kitchen_order_updated', payload.new);
          }
        })
        .subscribe();
      
      this.subscriptions.push(kitchenChannel);

      // Subscribe to settings changes
      const settingsChannel = this.supabase
        .channel('settings_changes')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'settings'
        }, (payload) => {
          console.log('Settings changed:', payload);
          this.emit('settings_updated', payload.new);
        })
        .subscribe();
      
      this.subscriptions.push(settingsChannel);

      console.log('✅ Real-time subscriptions active');
    } catch (error) {
      console.error('Error setting up subscriptions:', error);
    }
  }

  // Event handler registration
  on(event, handler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  // Emit event to handlers
  emit(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => handler(data));
    }
  }

  // Menu API
  async getMenu() {
    await this.init();
    
    if (!this.supabase) {
      // Fallback to localStorage
      const stored = localStorage.getItem('menu');
      return stored ? JSON.parse(stored) : [];
    }

    try {
      const { data, error } = await this.supabase
        .from('menu')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching menu:', error);
      return [];
    }
  }

  async addMenuItem(item) {
    await this.init();
    
    if (!this.supabase) {
      // Fallback to localStorage
      const menu = JSON.parse(localStorage.getItem('menu') || '[]');
      const newItem = { ...item, id: Date.now() };
      menu.push(newItem);
      localStorage.setItem('menu', JSON.stringify(menu));
      return newItem;
    }

    try {
      const { data, error } = await this.supabase
        .from('menu')
        .insert(item)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding menu item:', error);
      throw error;
    }
  }

  async deleteMenuItem(id) {
    await this.init();
    
    if (!this.supabase) {
      // Fallback to localStorage
      const menu = JSON.parse(localStorage.getItem('menu') || '[]');
      const filtered = menu.filter(item => item.id !== id);
      localStorage.setItem('menu', JSON.stringify(filtered));
      return;
    }

    try {
      const { error } = await this.supabase
        .from('menu')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting menu item:', error);
      throw error;
    }
  }

  async bulkUpdateMenu(items) {
    await this.init();
    
    if (!this.supabase) {
      // Fallback to localStorage
      const itemsWithIds = items.map((item, idx) => ({
        ...item,
        id: Date.now() + idx
      }));
      localStorage.setItem('menu', JSON.stringify(itemsWithIds));
      return itemsWithIds;
    }

    try {
      // Delete all existing items
      await this.supabase.from('menu').delete().neq('id', 0);
      
      // Insert new items
      const { data, error } = await this.supabase
        .from('menu')
        .insert(items)
        .select();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error bulk updating menu:', error);
      throw error;
    }
  }

  // Staff API
  async getStaff() {
    await this.init();
    
    if (!this.supabase) {
      const stored = localStorage.getItem('staffList');
      const names = stored ? JSON.parse(stored) : [];
      return names.map((name, idx) => ({ id: idx + 1, name, role: 'staff' }));
    }

    try {
      const { data, error } = await this.supabase
        .from('staff')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching staff:', error);
      return [];
    }
  }

  async addStaff(name) {
    await this.init();
    
    if (!this.supabase) {
      const staffList = JSON.parse(localStorage.getItem('staffList') || '[]');
      if (!staffList.includes(name)) {
        staffList.push(name);
        localStorage.setItem('staffList', JSON.stringify(staffList));
      }
      return { id: staffList.length, name, role: 'staff' };
    }

    try {
      const { data, error } = await this.supabase
        .from('staff')
        .insert({
          name,
          role: 'staff',
          email: generateStaffEmail(name)
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Create default permissions
      await this.supabase.from('staff_permissions').insert({
        staff_id: data.id,
        can_view_other_orders: false,
        allowed_staff_ids: []
      });
      
      return data;
    } catch (error) {
      console.error('Error adding staff:', error);
      throw error;
    }
  }

  async deleteStaff(id) {
    await this.init();
    
    if (!this.supabase) {
      // Fallback implementation
      return;
    }

    try {
      const { error } = await this.supabase
        .from('staff')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting staff:', error);
      throw error;
    }
  }

  // Orders API
  async getOrders() {
    await this.init();
    
    if (!this.supabase) {
      const stored = localStorage.getItem('orders');
      return stored ? JSON.parse(stored) : [];
    }

    try {
      const { data, error } = await this.supabase
        .from('orders')
        .select(`
          *,
          order_items (*)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Transform to expected format
      return (data || []).map(order => ({
        ...order,
        items: order.order_items || []
      }));
    } catch (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
  }

  async createOrder(order) {
    await this.init();
    
    if (!this.supabase) {
      const orders = JSON.parse(localStorage.getItem('orders') || '[]');
      const newOrder = {
        ...order,
        id: Date.now(),
        created_at: new Date().toISOString()
      };
      orders.push(newOrder);
      localStorage.setItem('orders', JSON.stringify(orders));
      return newOrder;
    }

    try {
      const { data, error } = await this.supabase
        .from('orders')
        .insert({
          table_id: order.table_id,
          staff_id: order.staff_id,
          staff_name: order.staff_name,
          status: order.status || 'pending',
          total: order.total || 0
        })
        .select()
        .single();
      
      if (error) throw error;
      return { ...data, items: [] };
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  async updateOrder(id, updates) {
    await this.init();
    
    if (!this.supabase) {
      const orders = JSON.parse(localStorage.getItem('orders') || '[]');
      const index = orders.findIndex(o => o.id === id);
      if (index !== -1) {
        orders[index] = { ...orders[index], ...updates };
        localStorage.setItem('orders', JSON.stringify(orders));
      }
      return orders[index];
    }

    try {
      const { data, error } = await this.supabase
        .from('orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  }

  // Kitchen Orders API
  async getKitchenOrders() {
    await this.init();
    
    if (!this.supabase) {
      const stored = localStorage.getItem('kitchenOrders');
      return stored ? JSON.parse(stored) : [];
    }

    try {
      const { data, error } = await this.supabase
        .from('kitchen_orders')
        .select('*')
        .order('sent_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching kitchen orders:', error);
      return [];
    }
  }

  async createKitchenOrder(order) {
    await this.init();
    
    if (!this.supabase) {
      const kitchenOrders = JSON.parse(localStorage.getItem('kitchenOrders') || '[]');
      const newOrder = {
        ...order,
        id: Date.now(),
        sent_at: new Date().toISOString()
      };
      kitchenOrders.push(newOrder);
      localStorage.setItem('kitchenOrders', JSON.stringify(kitchenOrders));
      return newOrder;
    }

    try {
      const { data, error } = await this.supabase
        .from('kitchen_orders')
        .insert({
          order_id: order.order_id,
          batch_id: order.batch_id,
          staff_name: order.staff_name,
          table_id: order.table_id,
          items: order.items,
          status: order.status || 'pending'
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating kitchen order:', error);
      throw error;
    }
  }

  async updateKitchenOrder(id, updates) {
    await this.init();
    
    if (!this.supabase) {
      const kitchenOrders = JSON.parse(localStorage.getItem('kitchenOrders') || '[]');
      const index = kitchenOrders.findIndex(o => o.id === id);
      if (index !== -1) {
        kitchenOrders[index] = { ...kitchenOrders[index], ...updates };
        localStorage.setItem('kitchenOrders', JSON.stringify(kitchenOrders));
      }
      return kitchenOrders[index];
    }

    try {
      const { data, error } = await this.supabase
        .from('kitchen_orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating kitchen order:', error);
      throw error;
    }
  }

  // Bills API
  async getBills(params = {}) {
    await this.init();
    
    if (!this.supabase) {
      const stored = localStorage.getItem('bills');
      return stored ? JSON.parse(stored) : [];
    }

    try {
      let query = this.supabase
        .from('bills')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (params.search) {
        query = query.or(`bill_number.ilike.%${params.search}%,staff_name.ilike.%${params.search}%`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching bills:', error);
      return [];
    }
  }

  async getBill(id) {
    await this.init();
    
    if (!this.supabase) {
      const bills = JSON.parse(localStorage.getItem('bills') || '[]');
      return bills.find(b => b.id === id);
    }

    try {
      const { data, error } = await this.supabase
        .from('bills')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching bill:', error);
      return null;
    }
  }

  async createBill(bill) {
    await this.init();
    
    if (!this.supabase) {
      const bills = JSON.parse(localStorage.getItem('bills') || '[]');
      const newBill = {
        ...bill,
        id: Date.now(),
        bill_number: `BILL-${Date.now()}`,
        created_at: new Date().toISOString()
      };
      bills.push(newBill);
      localStorage.setItem('bills', JSON.stringify(bills));
      return newBill;
    }

    try {
      const billNumber = `BILL-${Date.now()}`;
      const { data, error } = await this.supabase
        .from('bills')
        .insert({
          order_id: bill.order_id,
          bill_number: billNumber,
          table_id: bill.table_id,
          staff_name: bill.staff_name,
          items: bill.items,
          subtotal: bill.subtotal,
          tax: bill.tax,
          total: bill.total
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating bill:', error);
      throw error;
    }
  }

  // Settings API
  async getSettings() {
    await this.init();
    
    if (!this.supabase) {
      const stored = localStorage.getItem('settings');
      return stored ? JSON.parse(stored) : { tax_rate: 0, num_tables: 4 };
    }

    try {
      const { data, error } = await this.supabase
        .from('settings')
        .select('*');
      
      if (error) throw error;
      
      // Convert array of key-value pairs to object
      const settings = {};
      (data || []).forEach(item => {
        settings[item.key] = item.value;
      });
      
      return settings;
    } catch (error) {
      console.error('Error fetching settings:', error);
      return { tax_rate: 0, num_tables: 4 };
    }
  }

  async updateSetting(key, value) {
    await this.init();
    
    if (!this.supabase) {
      const settings = JSON.parse(localStorage.getItem('settings') || '{}');
      settings[key] = value;
      localStorage.setItem('settings', JSON.stringify(settings));
      return { key, value };
    }

    try {
      const { data, error } = await this.supabase
        .from('settings')
        .upsert({
          key,
          value,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating setting:', error);
      throw error;
    }
  }

  // Analytics API
  async getStaffPerformance() {
    await this.init();
    
    if (!this.supabase) {
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .rpc('get_staff_performance');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching staff performance:', error);
      // Fallback calculation
      const orders = await this.getOrders();
      const staff = {};
      
      orders.filter(o => o.status === 'completed').forEach(order => {
        if (!staff[order.staff_name]) {
          staff[order.staff_name] = {
            staff_name: order.staff_name,
            order_count: 0,
            total_revenue: 0
          };
        }
        staff[order.staff_name].order_count++;
        staff[order.staff_name].total_revenue += order.total || 0;
      });
      
      return Object.values(staff).map(s => ({
        ...s,
        avg_order_value: s.total_revenue / s.order_count
      }));
    }
  }

  async getPopularItems() {
    await this.init();
    
    if (!this.supabase) {
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .rpc('get_popular_items');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching popular items:', error);
      return [];
    }
  }

  async getDailySales(days = 30) {
    await this.init();
    
    if (!this.supabase) {
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .rpc('get_daily_sales', { days_back: days });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching daily sales:', error);
      return [];
    }
  }

  async getHourlySales() {
    await this.init();
    
    if (!this.supabase) {
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .rpc('get_hourly_sales');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching hourly sales:', error);
      return [];
    }
  }

  // Cleanup
  async cleanup() {
    for (const subscription of this.subscriptions) {
      await this.supabase?.removeChannel(subscription);
    }
    this.subscriptions = [];
  }
}

// Create global instance
const apiClient = new SupabaseAPIClient();

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
  apiClient.init().catch(error => {
    console.error('Failed to initialize API client:', error);
  });
});
