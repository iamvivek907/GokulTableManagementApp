// Enhanced server with Supabase support + SQLite fallback
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const {
  supabase,
  isSupabaseEnabled,
  createAuditLog,
  createNotification,
  getOrCreateStaffUser,
  getStaffPermissions,
  updateStaffPermissions,
  subscribeToTable
} = require('./supabase-client');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Determine which database to use
const USE_SUPABASE = isSupabaseEnabled();
console.log(`🗄️  Database Mode: ${USE_SUPABASE ? 'Supabase' : 'SQLite (fallback)'}`);

// SQLite setup (fallback)
let db = null;
if (!USE_SUPABASE) {
  db = new Database('restaurant.db');
  db.pragma('journal_mode = WAL');
  
  // Initialize database tables (existing SQLite schema)
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      staff_name TEXT NOT NULL,
      status TEXT NOT NULL,
      total REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS kitchen_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      batch_id INTEGER NOT NULL,
      staff_name TEXT NOT NULL,
      table_id INTEGER NOT NULL,
      items TEXT NOT NULL,
      status TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ready_at DATETIME,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      bill_number TEXT NOT NULL UNIQUE,
      table_id INTEGER NOT NULL,
      staff_name TEXT NOT NULL,
      items TEXT NOT NULL,
      subtotal REAL NOT NULL,
      tax REAL DEFAULT 0,
      total REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_kitchen_orders_status ON kitchen_orders(status);
    CREATE INDEX IF NOT EXISTS idx_bills_order_id ON bills(order_id);
  `);
  
  // Initialize default data if empty
  const menuCount = db.prepare('SELECT COUNT(*) as count FROM menu').get();
  if (menuCount.count === 0) {
    const defaultMenu = [
      { category: 'Appetizers', name: 'Samosa', price: 8 },
      { category: 'Appetizers', name: 'French Fries', price: 50 },
      { category: 'Appetizers', name: 'Chilli Potato', price: 60 },
      { category: 'Appetizers', name: 'Honey Chilli Potato', price: 70 },
      { category: 'Breads', name: 'Idly', price: 50 },
      { category: 'Breads', name: 'Veg Momos', price: 50 },
      { category: 'Breads', name: 'Veg Fried Momos', price: 70 },
      { category: 'Main Course', name: 'Paneer Momos', price: 80 },
      { category: 'Main Course', name: 'Paneer Fried Momos', price: 100 },
      { category: 'Main Course', name: 'Chilli Paneer (Half)', price: 80 },
      { category: 'Main Course', name: 'Chilli Paneer (Full)', price: 150 },
      { category: 'Main Course', name: 'Gokul Thali', price: 100 },
      { category: 'Main Course', name: 'Gokul Special Thali', price: 140 },
      { category: 'Main Course', name: 'Chowmein (Half)', price: 50 },
      { category: 'Main Course', name: 'Chowmein (Full)', price: 90 },
      { category: 'Main Course', name: 'Biryani (Half)', price: 120 },
      { category: 'Main Course', name: 'Biryani (Full)', price: 180 }
    ];
    
    const insertMenu = db.prepare('INSERT INTO menu (category, name, price) VALUES (?, ?, ?)');
    for (const item of defaultMenu) {
      insertMenu.run(item.category, item.name, item.price);
    }
  }

  // Initialize default settings
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (settingsCount.count === 0) {
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('num_tables', '4');
    insertSetting.run('owner_password', 'gokul2024');
    insertSetting.run('restaurant_name', 'Gokul Restaurant');
    insertSetting.run('tax_rate', '0');
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// WebSocket connections
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected. Total clients:', clients.size);

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected. Total clients:', clients.size);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast function
function broadcast(event, data) {
  const message = JSON.stringify({ event, data, timestamp: Date.now() });
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Set up Supabase real-time subscriptions if enabled
if (USE_SUPABASE) {
  // Subscribe to orders changes
  subscribeToTable('orders', (payload) => {
    console.log('Order change:', payload);
    broadcast('order_updated', payload.new);
  });

  // Subscribe to kitchen orders changes
  subscribeToTable('kitchen_orders', (payload) => {
    console.log('Kitchen order change:', payload);
    broadcast('kitchen_order_updated', payload.new);
  });

  // Subscribe to staff permissions changes
  subscribeToTable('staff_permissions', (payload) => {
    console.log('Staff permission change:', payload);
    broadcast('permission_updated', payload.new);
  });

  // Subscribe to notifications
  subscribeToTable('notifications', (payload) => {
    console.log('Notification:', payload);
    broadcast('notification', payload.new);
  });
}

// API Routes

// System info endpoint
app.get('/api/system-info', (req, res) => {
  res.json({
    database: USE_SUPABASE ? 'supabase' : 'sqlite',
    realtime: USE_SUPABASE,
    features: {
      multiUser: USE_SUPABASE,
      permissions: USE_SUPABASE,
      auditLogs: USE_SUPABASE,
      notifications: USE_SUPABASE
    }
  });
});

// Menu endpoints
app.get('/api/menu', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('menu')
        .select('*')
        .eq('is_active', true)
        .order('category, name');
      
      if (error) throw error;
      res.json(data);
    } else {
      const menu = db.prepare('SELECT * FROM menu ORDER BY category, name').all();
      res.json(menu);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/menu', async (req, res) => {
  try {
    const { category, name, price } = req.body;
    
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('menu')
        .insert({ category, name, price })
        .select()
        .single();
      
      if (error) throw error;
      broadcast('menu_updated', { action: 'add', item: data });
      res.json(data);
    } else {
      const result = db.prepare('INSERT INTO menu (category, name, price) VALUES (?, ?, ?)').run(category, name, price);
      const newItem = db.prepare('SELECT * FROM menu WHERE id = ?').get(result.lastInsertRowid);
      broadcast('menu_updated', { action: 'add', item: newItem });
      res.json(newItem);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/menu/:id', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { error } = await supabase
        .from('menu')
        .delete()
        .eq('id', req.params.id);
      
      if (error) throw error;
    } else {
      db.prepare('DELETE FROM menu WHERE id = ?').run(req.params.id);
    }
    
    broadcast('menu_updated', { action: 'delete', id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/menu/bulk', async (req, res) => {
  try {
    const { items } = req.body;
    
    if (USE_SUPABASE) {
      // Delete all existing menu items explicitly
      await supabase.from('menu').delete().gte('id', '00000000-0000-0000-0000-000000000000');
      
      // Insert new items
      const { data, error } = await supabase
        .from('menu')
        .insert(items)
        .select();
      
      if (error) throw error;
      broadcast('menu_updated', { action: 'bulk_update' });
      res.json(data);
    } else {
      db.prepare('DELETE FROM menu').run();
      const insert = db.prepare('INSERT INTO menu (category, name, price) VALUES (?, ?, ?)');
      for (const item of items) {
        insert.run(item.category, item.name, item.price);
      }
      const menu = db.prepare('SELECT * FROM menu ORDER BY category, name').all();
      broadcast('menu_updated', { action: 'bulk_update' });
      res.json(menu);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Staff endpoints
app.get('/api/staff', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'staff')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      res.json(data);
    } else {
      const staff = db.prepare('SELECT * FROM staff ORDER BY created_at DESC').all();
      res.json(staff);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/staff', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (USE_SUPABASE) {
      const user = await getOrCreateStaffUser(name);
      broadcast('staff_updated', { action: 'add', staff: user });
      res.json(user);
    } else {
      const result = db.prepare('INSERT INTO staff (name) VALUES (?)').run(name);
      const newStaff = db.prepare('SELECT * FROM staff WHERE id = ?').get(result.lastInsertRowid);
      broadcast('staff_updated', { action: 'add', staff: newStaff });
      res.json(newStaff);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/staff/:id', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', req.params.id);
      
      if (error) throw error;
    } else {
      db.prepare('DELETE FROM staff WHERE id = ?').run(req.params.id);
    }
    
    broadcast('staff_updated', { action: 'delete', id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Staff permissions endpoints
app.get('/api/staff-permissions/:staffId', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const permissions = await getStaffPermissions(req.params.staffId);
      res.json(permissions);
    } else {
      // SQLite doesn't support permissions - return default
      res.json({ can_view_all_orders: false, allowed_staff_ids: [] });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/staff-permissions/:staffId', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const permissions = await updateStaffPermissions(req.params.staffId, req.body);
      broadcast('permission_updated', permissions);
      res.json(permissions);
    } else {
      res.json({ message: 'Permissions not supported in SQLite mode' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Orders endpoints
app.get('/api/orders', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Transform to match expected format
      const transformedOrders = orders.map(order => ({
        ...order,
        items: order.order_items.map(item => ({
          name: item.item_name,
          quantity: item.quantity,
          price: parseFloat(item.price)
        }))
      }));
      
      res.json(transformedOrders);
    } else {
      const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
      
      // Get items for each order
      const ordersWithItems = orders.map(order => {
        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
        return {
          ...order,
          items: items.map(item => ({
            name: item.item_name,
            quantity: item.quantity,
            price: item.price
          }))
        };
      });
      
      res.json(ordersWithItems);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { table_id, staff_name, items, status } = req.body;
    
    if (USE_SUPABASE) {
      // Get or create staff user
      const staffUser = await getOrCreateStaffUser(staff_name);
      
      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          table_id,
          staff_id: staffUser.id,
          staff_name,
          status: status || 'pending',
          total: 0
        })
        .select()
        .single();
      
      if (orderError) throw orderError;
      
      // Create order items if provided
      if (items && items.length > 0) {
        const orderItems = items.map(item => ({
          order_id: order.id,
          item_name: item.name,
          quantity: item.qty || item.quantity || 1,
          price: item.price
        }));
        
        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItems);
        
        if (itemsError) throw itemsError;
        
        // Calculate total
        const total = items.reduce((sum, item) => sum + (item.price * (item.qty || item.quantity || 1)), 0);
        
        await supabase
          .from('orders')
          .update({ total })
          .eq('id', order.id);
        
        order.total = total;
      }
      
      order.items = items || [];
      
      await createAuditLog(staffUser.id, 'CREATE', 'order', order.id, null, order, {
        userName: staff_name
      });
      
      broadcast('order_created', order);
      res.json(order);
    } else {
      const result = db.prepare(
        'INSERT INTO orders (table_id, staff_name, status, total) VALUES (?, ?, ?, ?)'
      ).run(table_id, staff_name, status || 'pending', 0);
      
      const orderId = result.lastInsertRowid;
      
      // Insert order items if provided
      if (items && items.length > 0) {
        const insertItem = db.prepare(
          'INSERT INTO order_items (order_id, item_name, quantity, price) VALUES (?, ?, ?, ?)'
        );
        
        let total = 0;
        for (const item of items) {
          insertItem.run(orderId, item.name, item.qty || item.quantity || 1, item.price);
          total += item.price * (item.qty || item.quantity || 1);
        }
        
        // Update total
        db.prepare('UPDATE orders SET total = ? WHERE id = ?').run(total, orderId);
      }
      
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
      
      order.items = orderItems.map(item => ({
        name: item.item_name,
        quantity: item.quantity,
        price: item.price
      }));
      
      broadcast('order_created', order);
      res.json(order);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/orders/:id', async (req, res) => {
  try {
    const updates = req.body;
    
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();
      
      if (error) throw error;
      
      broadcast('order_updated', data);
      res.json(data);
    } else {
      // Whitelist allowed fields to prevent SQL injection
      const allowedFields = ['status', 'total', 'completed_at', 'table_id', 'staff_name'];
      const sanitizedUpdates = {};
      
      for (const key of Object.keys(updates)) {
        if (allowedFields.includes(key)) {
          sanitizedUpdates[key] = updates[key];
        }
      }
      
      if (Object.keys(sanitizedUpdates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }
      
      const fields = Object.keys(sanitizedUpdates).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(sanitizedUpdates), req.params.id];
      
      db.prepare(`UPDATE orders SET ${fields} WHERE id = ?`).run(...values);
      
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
      
      order.items = orderItems.map(item => ({
        name: item.item_name,
        quantity: item.quantity,
        price: item.price
      }));
      
      broadcast('order_updated', order);
      res.json(order);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Kitchen orders endpoints
app.get('/api/kitchen-orders', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('kitchen_orders')
        .select('*')
        .order('sent_at', { ascending: false });
      
      if (error) throw error;
      res.json(data);
    } else {
      const kitchenOrders = db.prepare('SELECT * FROM kitchen_orders ORDER BY sent_at DESC').all();
      
      // Parse JSON items field
      const orders = kitchenOrders.map(ko => ({
        ...ko,
        items: JSON.parse(ko.items)
      }));
      
      res.json(orders);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/kitchen-orders', async (req, res) => {
  try {
    const { order_id, batch_id, staff_name, table_id, items, status } = req.body;
    
    if (USE_SUPABASE) {
      const staffUser = await getOrCreateStaffUser(staff_name);
      
      const { data, error } = await supabase
        .from('kitchen_orders')
        .insert({
          order_id,
          batch_id,
          staff_id: staffUser.id,
          staff_name,
          table_id,
          items: items,
          status: status || 'pending'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      broadcast('kitchen_order_created', data);
      res.json(data);
    } else {
      const result = db.prepare(
        'INSERT INTO kitchen_orders (order_id, batch_id, staff_name, table_id, items, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(order_id, batch_id, staff_name, table_id, JSON.stringify(items), status || 'pending');
      
      const kitchenOrder = db.prepare('SELECT * FROM kitchen_orders WHERE id = ?').get(result.lastInsertRowid);
      kitchenOrder.items = JSON.parse(kitchenOrder.items);
      
      broadcast('kitchen_order_created', kitchenOrder);
      res.json(kitchenOrder);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/kitchen-orders/:id', async (req, res) => {
  try {
    const updates = req.body;
    
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('kitchen_orders')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();
      
      if (error) throw error;
      
      broadcast('kitchen_order_updated', data);
      res.json(data);
    } else {
      // Whitelist allowed fields to prevent SQL injection
      const allowedFields = ['status', 'ready_at'];
      const sanitizedUpdates = {};
      
      for (const key of Object.keys(updates)) {
        if (allowedFields.includes(key)) {
          sanitizedUpdates[key] = updates[key];
        }
      }
      
      if (Object.keys(sanitizedUpdates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }
      
      const fields = Object.keys(sanitizedUpdates).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(sanitizedUpdates), req.params.id];
      
      db.prepare(`UPDATE kitchen_orders SET ${fields} WHERE id = ?`).run(...values);
      
      const kitchenOrder = db.prepare('SELECT * FROM kitchen_orders WHERE id = ?').get(req.params.id);
      kitchenOrder.items = JSON.parse(kitchenOrder.items);
      
      broadcast('kitchen_order_updated', kitchenOrder);
      res.json(kitchenOrder);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bills endpoints
app.get('/api/bills', async (req, res) => {
  try {
    const { search } = req.query;
    
    if (USE_SUPABASE) {
      let query = supabase
        .from('bills')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (search) {
        query = query.or(`bill_number.ilike.%${search}%,staff_name.ilike.%${search}%`);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      res.json(data);
    } else {
      let query = 'SELECT * FROM bills';
      const params = [];
      
      if (search) {
        query += ' WHERE bill_number LIKE ? OR staff_name LIKE ?';
        params.push(`%${search}%`, `%${search}%`);
      }
      
      query += ' ORDER BY created_at DESC';
      
      const bills = db.prepare(query).all(...params);
      
      // Parse JSON items
      const billsWithItems = bills.map(bill => ({
        ...bill,
        items: JSON.parse(bill.items)
      }));
      
      res.json(billsWithItems);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/:id', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('id', req.params.id)
        .single();
      
      if (error) throw error;
      res.json(data);
    } else {
      const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
      if (bill) {
        bill.items = JSON.parse(bill.items);
      }
      res.json(bill);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bills', async (req, res) => {
  try {
    const { order_id, table_id, staff_name, items, subtotal, tax, total } = req.body;
    
    // Generate bill number
    const billNumber = `BILL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    if (USE_SUPABASE) {
      const staffUser = await getOrCreateStaffUser(staff_name);
      
      const { data, error } = await supabase
        .from('bills')
        .insert({
          order_id,
          bill_number: billNumber,
          table_id,
          staff_id: staffUser.id,
          staff_name,
          items: items,
          subtotal,
          tax: tax || 0,
          total
        })
        .select()
        .single();
      
      if (error) throw error;
      
      await createAuditLog(staffUser.id, 'CREATE', 'bill', data.id, null, data, {
        userName: staff_name
      });
      
      broadcast('bill_created', data);
      res.json(data);
    } else {
      const result = db.prepare(
        'INSERT INTO bills (order_id, bill_number, table_id, staff_name, items, subtotal, tax, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(order_id, billNumber, table_id, staff_name, JSON.stringify(items), subtotal, tax || 0, total);
      
      const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(result.lastInsertRowid);
      bill.items = JSON.parse(bill.items);
      
      broadcast('bill_created', bill);
      res.json(bill);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Settings endpoints
app.get('/api/settings', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('settings')
        .select('*');
      
      if (error) throw error;
      
      // Convert to key-value object
      const settings = {};
      data.forEach(setting => {
        settings[setting.key] = setting.value;
      });
      
      res.json(settings);
    } else {
      const settings = db.prepare('SELECT * FROM settings').all();
      
      // Convert to key-value object
      const settingsObj = {};
      settings.forEach(setting => {
        settingsObj[setting.key] = setting.value;
      });
      
      res.json(settingsObj);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('settings')
        .upsert({ key, value }, { onConflict: 'key' })
        .select()
        .single();
      
      if (error) throw error;
      
      broadcast('setting_updated', data);
      res.json(data);
    } else {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
      
      const setting = db.prepare('SELECT * FROM settings WHERE key = ?').get(key);
      
      broadcast('setting_updated', setting);
      res.json(setting);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analytics endpoints
app.get('/api/analytics/staff-performance', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('bills')
        .select('staff_name, staff_id, total')
        .order('staff_name');
      
      if (error) throw error;
      
      // Aggregate by staff
      const staffStats = {};
      data.forEach(bill => {
        if (!staffStats[bill.staff_name]) {
          staffStats[bill.staff_name] = {
            staff_name: bill.staff_name,
            staff_id: bill.staff_id,
            order_count: 0,
            total_revenue: 0
          };
        }
        staffStats[bill.staff_name].order_count++;
        staffStats[bill.staff_name].total_revenue += parseFloat(bill.total);
      });
      
      // Calculate averages
      const performance = Object.values(staffStats).map(stats => ({
        ...stats,
        avg_order_value: stats.order_count > 0 ? stats.total_revenue / stats.order_count : 0
      }));
      
      res.json(performance);
    } else {
      const bills = db.prepare('SELECT staff_name, total FROM bills').all();
      
      // Aggregate by staff
      const staffStats = {};
      bills.forEach(bill => {
        if (!staffStats[bill.staff_name]) {
          staffStats[bill.staff_name] = {
            staff_name: bill.staff_name,
            order_count: 0,
            total_revenue: 0
          };
        }
        staffStats[bill.staff_name].order_count++;
        staffStats[bill.staff_name].total_revenue += bill.total;
      });
      
      // Calculate averages
      const performance = Object.values(staffStats).map(stats => ({
        ...stats,
        avg_order_value: stats.order_count > 0 ? stats.total_revenue / stats.order_count : 0
      }));
      
      res.json(performance);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/popular-items', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('order_items')
        .select('item_name, quantity, price');
      
      if (error) throw error;
      
      // Aggregate by item
      const itemStats = {};
      data.forEach(item => {
        if (!itemStats[item.item_name]) {
          itemStats[item.item_name] = {
            item_name: item.item_name,
            total_quantity: 0,
            order_count: 0,
            total_revenue: 0
          };
        }
        itemStats[item.item_name].total_quantity += item.quantity;
        itemStats[item.item_name].order_count++;
        itemStats[item.item_name].total_revenue += item.quantity * parseFloat(item.price);
      });
      
      // Sort by total quantity
      const popularItems = Object.values(itemStats)
        .sort((a, b) => b.total_quantity - a.total_quantity)
        .slice(0, 20);
      
      res.json(popularItems);
    } else {
      const items = db.prepare('SELECT item_name, quantity, price FROM order_items').all();
      
      // Aggregate by item
      const itemStats = {};
      items.forEach(item => {
        if (!itemStats[item.item_name]) {
          itemStats[item.item_name] = {
            item_name: item.item_name,
            total_quantity: 0,
            order_count: 0,
            total_revenue: 0
          };
        }
        itemStats[item.item_name].total_quantity += item.quantity;
        itemStats[item.item_name].order_count++;
        itemStats[item.item_name].total_revenue += item.quantity * item.price;
      });
      
      // Sort by total quantity
      const popularItems = Object.values(itemStats)
        .sort((a, b) => b.total_quantity - a.total_quantity)
        .slice(0, 20);
      
      res.json(popularItems);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/daily-sales', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('bills')
        .select('created_at, total')
        .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at');
      
      if (error) throw error;
      
      // Aggregate by date
      const dailyStats = {};
      data.forEach(bill => {
        const date = new Date(bill.created_at).toISOString().split('T')[0];
        if (!dailyStats[date]) {
          dailyStats[date] = {
            date,
            order_count: 0,
            total_revenue: 0
          };
        }
        dailyStats[date].order_count++;
        dailyStats[date].total_revenue += parseFloat(bill.total);
      });
      
      res.json(Object.values(dailyStats));
    } else {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const bills = db.prepare('SELECT created_at, total FROM bills WHERE created_at >= ? ORDER BY created_at').all(cutoffDate);
      
      // Aggregate by date
      const dailyStats = {};
      bills.forEach(bill => {
        const date = bill.created_at.split('T')[0];
        if (!dailyStats[date]) {
          dailyStats[date] = {
            date,
            order_count: 0,
            total_revenue: 0
          };
        }
        dailyStats[date].order_count++;
        dailyStats[date].total_revenue += bill.total;
      });
      
      res.json(Object.values(dailyStats));
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/hourly-sales', async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('bills')
        .select('created_at, total')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      if (error) throw error;
      
      // Aggregate by hour
      const hourlyStats = {};
      data.forEach(bill => {
        const hour = new Date(bill.created_at).getHours();
        if (!hourlyStats[hour]) {
          hourlyStats[hour] = {
            hour,
            order_count: 0,
            total_revenue: 0
          };
        }
        hourlyStats[hour].order_count++;
        hourlyStats[hour].total_revenue += parseFloat(bill.total);
      });
      
      res.json(Object.values(hourlyStats).sort((a, b) => a.hour - b.hour));
    } else {
      const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const bills = db.prepare('SELECT created_at, total FROM bills WHERE created_at >= ?').all(cutoffDate);
      
      // Aggregate by hour
      const hourlyStats = {};
      bills.forEach(bill => {
        const hour = new Date(bill.created_at).getHours();
        if (!hourlyStats[hour]) {
          hourlyStats[hour] = {
            hour,
            order_count: 0,
            total_revenue: 0
          };
        }
        hourlyStats[hour].order_count++;
        hourlyStats[hour].total_revenue += bill.total;
      });
      
      res.json(Object.values(hourlyStats).sort((a, b) => a.hour - b.hour));
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    clients: clients.size, 
    database: USE_SUPABASE ? 'supabase' : 'sqlite',
    timestamp: Date.now() 
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
  if (!USE_SUPABASE) {
    console.log('💡 To enable Supabase features, configure .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
});
