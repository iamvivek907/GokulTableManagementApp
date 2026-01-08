// State Management for Data Persistence
// This module ensures data persists across page refreshes and handles sync failures

class StateManager {
  constructor() {
    this.storageKey = 'gokul_app_state';
    this.state = this.loadState();
    this.syncQueue = [];
    this.isOnline = navigator.onLine;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Monitor online/offline status
    window.addEventListener('online', () => {
      console.log('📡 Connection restored - syncing queued data');
      this.isOnline = true;
      this.processSyncQueue();
    });

    window.addEventListener('offline', () => {
      console.log('📴 Connection lost - queuing changes');
      this.isOnline = false;
    });

    // Save state before page unload
    window.addEventListener('beforeunload', () => {
      this.saveState();
    });

    // Periodic auto-save (every 10 seconds)
    setInterval(() => {
      this.saveState();
    }, 10000);
  }

  loadState() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const state = JSON.parse(saved);
        console.log('✅ State restored from local storage');
        return state;
      }
    } catch (error) {
      console.error('❌ Error loading state:', error);
    }
    return this.getDefaultState();
  }

  getDefaultState() {
    return {
      currentUser: null,
      currentRole: null,
      currentStaff: null,
      activeOrders: {},
      pendingSync: [],
      lastSync: null,
      sessionId: Date.now().toString(36)
    };
  }

  saveState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
      console.log('💾 State saved');
    } catch (error) {
      console.error('❌ Error saving state:', error);
    }
  }

  // Set user session
  setSession(role, staff = null) {
    this.state.currentRole = role;
    this.state.currentStaff = staff;
    this.state.lastSync = new Date().toISOString();
    this.saveState();
    
    // Also save to sessionStorage for quick access
    sessionStorage.setItem('currentRole', role);
    if (staff) sessionStorage.setItem('currentStaff', staff);
  }

  // Get current session
  getSession() {
    return {
      role: this.state.currentRole,
      staff: this.state.currentStaff,
      sessionId: this.state.sessionId
    };
  }

  // Clear session (logout)
  clearSession() {
    this.state.currentRole = null;
    this.state.currentStaff = null;
    this.state.activeOrders = {};
    this.saveState();
    sessionStorage.clear();
  }

  // Add active order (for staff)
  setActiveOrder(tableId, orderData) {
    this.state.activeOrders[tableId] = {
      ...orderData,
      lastModified: new Date().toISOString()
    };
    this.saveState();
  }

  // Get active order
  getActiveOrder(tableId) {
    return this.state.activeOrders[tableId] || null;
  }

  // Clear active order
  clearActiveOrder(tableId) {
    delete this.state.activeOrders[tableId];
    this.saveState();
  }

  // Queue data for sync when offline
  queueForSync(action, data) {
    const syncItem = {
      id: Date.now() + Math.random(),
      action,
      data,
      timestamp: new Date().toISOString(),
      retries: 0
    };
    
    this.syncQueue.push(syncItem);
    this.state.pendingSync.push(syncItem);
    this.saveState();

    // Try to sync immediately if online
    if (this.isOnline) {
      this.processSyncQueue();
    }
  }

  // Process sync queue
  async processSyncQueue() {
    if (!this.isOnline || this.syncQueue.length === 0) {
      return;
    }

    console.log(`🔄 Processing ${this.syncQueue.length} queued items...`);
    
    const itemsToSync = [...this.syncQueue];
    this.syncQueue = [];

    for (const item of itemsToSync) {
      try {
        await this.syncItem(item);
        // Remove from pending sync on success
        this.state.pendingSync = this.state.pendingSync.filter(i => i.id !== item.id);
      } catch (error) {
        console.error('❌ Sync failed for item:', item.id, error);
        item.retries++;
        
        if (item.retries < 3) {
          // Re-queue for retry
          this.syncQueue.push(item);
        } else {
          console.error('❌ Max retries reached for item:', item.id);
        }
      }
    }

    this.saveState();
  }

  // Sync individual item
  async syncItem(item) {
    const { action, data } = item;
    
    switch (action) {
      case 'create_order':
        return await apiClient.createOrder(data);
      case 'update_order':
        return await apiClient.updateOrder(data.id, data.updates);
      case 'create_kitchen_order':
        return await apiClient.createKitchenOrder(data);
      case 'update_kitchen_order':
        return await apiClient.updateKitchenOrder(data.id, data.updates);
      case 'create_bill':
        return await apiClient.createBill(data);
      default:
        console.warn('Unknown sync action:', action);
    }
  }

  // Check if there's pending sync
  hasPendingSync() {
    return this.state.pendingSync.length > 0;
  }

  // Get pending sync count
  getPendingSyncCount() {
    return this.state.pendingSync.length;
  }

  // Force sync all pending items
  async forceSyncAll() {
    if (this.state.pendingSync.length > 0) {
      this.syncQueue = [...this.state.pendingSync];
      await this.processSyncQueue();
    }
  }
}

// Create global instance
const stateManager = new StateManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StateManager;
}
