// API Client for real-time communication with backend
class APIClient {
  constructor() {
    this.baseURL = window.location.origin;
    this.ws = null;
    this.reconnectInterval = 3000;
    this.eventHandlers = {};
    this.connected = false;
  }

  // Initialize WebSocket connection
  initWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsURL = `${wsProtocol}//${window.location.host}`;
    
    this.ws = new WebSocket(wsURL);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.connected = true;
      this.emit('connected');
    };
    
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.emit(message.event, message.data);
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.connected = false;
      this.emit('disconnected');
      setTimeout(() => this.initWebSocket(), this.reconnectInterval);
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
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

  // HTTP requests
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const response = await fetch(url, { ...defaultOptions, ...options });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }

  // Menu API
  async getMenu() {
    return this.request('/api/menu');
  }

  async addMenuItem(item) {
    return this.request('/api/menu', {
      method: 'POST',
      body: JSON.stringify(item)
    });
  }

  async deleteMenuItem(id) {
    return this.request(`/api/menu/${id}`, {
      method: 'DELETE'
    });
  }

  async bulkUpdateMenu(items) {
    return this.request('/api/menu/bulk', {
      method: 'POST',
      body: JSON.stringify({ items })
    });
  }

  // Staff API
  async getStaff() {
    return this.request('/api/staff');
  }

  async addStaff(name) {
    return this.request('/api/staff', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  async deleteStaff(id) {
    return this.request(`/api/staff/${id}`, {
      method: 'DELETE'
    });
  }

  // Orders API
  async getOrders() {
    return this.request('/api/orders');
  }

  async createOrder(order) {
    return this.request('/api/orders', {
      method: 'POST',
      body: JSON.stringify(order)
    });
  }

  async updateOrder(id, updates) {
    return this.request(`/api/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  // Kitchen Orders API
  async getKitchenOrders() {
    return this.request('/api/kitchen-orders');
  }

  async createKitchenOrder(order) {
    return this.request('/api/kitchen-orders', {
      method: 'POST',
      body: JSON.stringify(order)
    });
  }

  async updateKitchenOrder(id, updates) {
    return this.request(`/api/kitchen-orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  // Bills API
  async getBills(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/bills${query ? '?' + query : ''}`);
  }

  async getBill(id) {
    return this.request(`/api/bills/${id}`);
  }

  async createBill(bill) {
    return this.request('/api/bills', {
      method: 'POST',
      body: JSON.stringify(bill)
    });
  }

  // Settings API
  async getSettings() {
    return this.request('/api/settings');
  }

  async updateSetting(key, value) {
    return this.request('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ key, value })
    });
  }

  // Analytics API
  async getStaffPerformance() {
    return this.request('/api/analytics/staff-performance');
  }

  async getPopularItems() {
    return this.request('/api/analytics/popular-items');
  }

  async getDailySales(days = 30) {
    return this.request(`/api/analytics/daily-sales?days=${days}`);
  }

  async getHourlySales() {
    return this.request('/api/analytics/hourly-sales');
  }
}

// Create global instance
const apiClient = new APIClient();
