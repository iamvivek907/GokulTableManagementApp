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
      // Delete all existing
      await supabase.from('menu').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
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

// Continue with remaining endpoints in next part...
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
