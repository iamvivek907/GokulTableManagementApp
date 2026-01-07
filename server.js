const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Database setup
const db = new Database('restaurant.db');
db.pragma('journal_mode = WAL');

// Initialize database tables
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

// API Routes

// Menu endpoints
app.get('/api/menu', (req, res) => {
  try {
    const menu = db.prepare('SELECT * FROM menu ORDER BY category, name').all();
    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/menu', (req, res) => {
  try {
    const { category, name, price } = req.body;
    const result = db.prepare('INSERT INTO menu (category, name, price) VALUES (?, ?, ?)').run(category, name, price);
    const newItem = db.prepare('SELECT * FROM menu WHERE id = ?').get(result.lastInsertRowid);
    broadcast('menu_updated', { action: 'add', item: newItem });
    res.json(newItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/menu/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM menu WHERE id = ?').run(req.params.id);
    broadcast('menu_updated', { action: 'delete', id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/menu/bulk', (req, res) => {
  try {
    const { items } = req.body;
    db.prepare('DELETE FROM menu').run();
    const insert = db.prepare('INSERT INTO menu (category, name, price) VALUES (?, ?, ?)');
    for (const item of items) {
      insert.run(item.category, item.name, item.price);
    }
    const menu = db.prepare('SELECT * FROM menu ORDER BY category, name').all();
    broadcast('menu_updated', { action: 'bulk_update' });
    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Staff endpoints
app.get('/api/staff', (req, res) => {
  try {
    const staff = db.prepare('SELECT * FROM staff ORDER BY name').all();
    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/staff', (req, res) => {
  try {
    const { name } = req.body;
    const result = db.prepare('INSERT INTO staff (name) VALUES (?)').run(name);
    const newStaff = db.prepare('SELECT * FROM staff WHERE id = ?').get(result.lastInsertRowid);
    broadcast('staff_updated', { action: 'add', staff: newStaff });
    res.json(newStaff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/staff/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM staff WHERE id = ?').run(req.params.id);
    broadcast('staff_updated', { action: 'delete', id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Orders endpoints
app.get('/api/orders', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    for (const order of orders) {
      order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    }
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const { table_id, staff_name, items, status } = req.body;
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const result = db.prepare('INSERT INTO orders (table_id, staff_name, status, total) VALUES (?, ?, ?, ?)').run(table_id, staff_name, status || 'pending', total);
    const orderId = result.lastInsertRowid;
    
    const insertItem = db.prepare('INSERT INTO order_items (order_id, item_name, quantity, price) VALUES (?, ?, ?, ?)');
    for (const item of items) {
      insertItem.run(orderId, item.name, item.quantity, item.price);
    }
    
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    
    broadcast('order_created', order);
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/orders/:id', (req, res) => {
  try {
    const { status, completed_at } = req.body;
    const updates = [];
    const params = [];
    
    if (status) {
      updates.push('status = ?');
      params.push(status);
    }
    if (completed_at) {
      updates.push('completed_at = ?');
      params.push(completed_at);
    }
    
    params.push(req.params.id);
    db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    
    broadcast('order_updated', order);
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Kitchen orders endpoints
app.get('/api/kitchen-orders', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM kitchen_orders ORDER BY sent_at DESC').all();
    for (const order of orders) {
      order.items = JSON.parse(order.items);
    }
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/kitchen-orders', (req, res) => {
  try {
    const { order_id, batch_id, staff_name, table_id, items, status } = req.body;
    
    const result = db.prepare('INSERT INTO kitchen_orders (order_id, batch_id, staff_name, table_id, items, status) VALUES (?, ?, ?, ?, ?, ?)').run(
      order_id, batch_id, staff_name, table_id, JSON.stringify(items), status || 'pending'
    );
    
    const kitchenOrder = db.prepare('SELECT * FROM kitchen_orders WHERE id = ?').get(result.lastInsertRowid);
    kitchenOrder.items = JSON.parse(kitchenOrder.items);
    
    broadcast('kitchen_order_created', kitchenOrder);
    res.json(kitchenOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/kitchen-orders/:id', (req, res) => {
  try {
    const { status, ready_at } = req.body;
    const updates = ['status = ?'];
    const params = [status];
    
    if (ready_at) {
      updates.push('ready_at = ?');
      params.push(ready_at);
    }
    
    params.push(req.params.id);
    db.prepare(`UPDATE kitchen_orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    const kitchenOrder = db.prepare('SELECT * FROM kitchen_orders WHERE id = ?').get(req.params.id);
    kitchenOrder.items = JSON.parse(kitchenOrder.items);
    
    broadcast('kitchen_order_updated', kitchenOrder);
    res.json(kitchenOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bills endpoints
app.get('/api/bills', (req, res) => {
  try {
    const { search, from_date, to_date } = req.query;
    let query = 'SELECT * FROM bills WHERE 1=1';
    const params = [];
    
    if (search) {
      query += ' AND (bill_number LIKE ? OR staff_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (from_date) {
      query += ' AND created_at >= ?';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND created_at <= ?';
      params.push(to_date);
    }
    
    query += ' ORDER BY created_at DESC';
    const bills = db.prepare(query).all(...params);
    
    for (const bill of bills) {
      bill.items = JSON.parse(bill.items);
    }
    
    res.json(bills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/:id', (req, res) => {
  try {
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
    if (bill) {
      bill.items = JSON.parse(bill.items);
      res.json(bill);
    } else {
      res.status(404).json({ error: 'Bill not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bills', (req, res) => {
  try {
    const { order_id, table_id, staff_name, items, subtotal, tax, total } = req.body;
    const bill_number = `BILL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    const result = db.prepare('INSERT INTO bills (order_id, bill_number, table_id, staff_name, items, subtotal, tax, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      order_id, bill_number, table_id, staff_name, JSON.stringify(items), subtotal, tax, total
    );
    
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(result.lastInsertRowid);
    bill.items = JSON.parse(bill.items);
    
    broadcast('bill_created', bill);
    res.json(bill);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Settings endpoints
app.get('/api/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings').all();
    const settingsObj = {};
    for (const setting of settings) {
      settingsObj[setting.key] = setting.value;
    }
    res.json(settingsObj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const { key, value } = req.body;
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    broadcast('settings_updated', { key, value });
    res.json({ key, value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analytics endpoints
app.get('/api/analytics/staff-performance', (req, res) => {
  try {
    const performance = db.prepare(`
      SELECT 
        staff_name,
        COUNT(*) as order_count,
        SUM(total) as total_revenue,
        AVG(total) as avg_order_value
      FROM orders
      WHERE status = 'completed'
      GROUP BY staff_name
      ORDER BY total_revenue DESC
    `).all();
    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/popular-items', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT 
        item_name,
        SUM(quantity) as total_quantity,
        COUNT(DISTINCT order_id) as order_count,
        SUM(quantity * price) as total_revenue
      FROM order_items
      GROUP BY item_name
      ORDER BY total_quantity DESC
      LIMIT 20
    `).all();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/daily-sales', (req, res) => {
  try {
    let { days = 30 } = req.query;
    // Sanitize input to prevent SQL injection
    days = parseInt(days, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      days = 30; // Default to 30 days if invalid
    }
    
    const sales = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as order_count,
        SUM(total) as total_revenue
      FROM orders
      WHERE status = 'completed' AND created_at >= datetime('now', ? || ' days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all(`-${days}`);
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/hourly-sales', (req, res) => {
  try {
    const sales = db.prepare(`
      SELECT 
        strftime('%H', created_at) as hour,
        COUNT(*) as order_count,
        SUM(total) as total_revenue
      FROM orders
      WHERE status = 'completed' AND DATE(created_at) = DATE('now')
      GROUP BY hour
      ORDER BY hour
    `).all();
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', clients: clients.size, timestamp: Date.now() });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
