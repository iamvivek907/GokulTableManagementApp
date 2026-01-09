// Supabase Client Configuration for Browser
// This is a browser-compatible version that doesn't use Node.js APIs

// Supabase credentials - will be injected during build or loaded from window
const SUPABASE_URL = window.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

// Check if Supabase is configured
if (!window.SUPABASE_URL && (SUPABASE_URL === 'YOUR_SUPABASE_URL' || !SUPABASE_URL)) {
  console.warn('⚠️  Supabase not configured. Set window.SUPABASE_URL and window.SUPABASE_ANON_KEY');
  console.warn('⚠️  Application will work in offline mode with localStorage');
}

// Initialize Supabase client using CDN-loaded library
let supabase = null;

/**
 * Utility function to generate email from staff name
 * @param {string} name - Staff member's name
 * @returns {string} - Generated email address
 */
function generateStaffEmail(name) {
  const sanitized = name.toLowerCase()
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, '.');
  return `${sanitized}@gokul-staff.local`;
}

// Wait for Supabase library to load from CDN
function initSupabase() {
  if (supabase && typeof supabase === 'object' && supabase.from) {
    // Already initialized
    return Promise.resolve(supabase);
  }
  
  return new Promise((resolve) => {
    const checkSupabase = () => {
      if (window.supabase && window.supabase.createClient) {
        const url = window.SUPABASE_URL || SUPABASE_URL;
        const key = window.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
        
        if (url && key && url !== 'YOUR_SUPABASE_URL' && key !== 'YOUR_SUPABASE_ANON_KEY') {
          supabase = window.supabase.createClient(url, key, {
            auth: {
              autoRefreshToken: true,
              persistSession: true
            }
          });
          console.log('✅ Supabase client initialized');
          resolve(supabase);
        } else {
          console.warn('⚠️  Supabase credentials not properly configured');
          resolve(null);
        }
      } else {
        // Retry after 100ms if library not loaded yet
        setTimeout(checkSupabase, 100);
      }
    };
    checkSupabase();
  });
}

/**
 * Check if Supabase is configured and available
 */
async function isSupabaseEnabled() {
  if (supabase) return true;
  await initSupabase();
  return supabase !== null;
}

/**
 * Create audit log entry
 */
async function createAuditLog(userId, action, entityType, entityId, oldValues, newValues, metadata = {}) {
  await initSupabase();
  if (!supabase) return;
  
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      user_name: metadata.userName,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_values: oldValues,
      new_values: newValues,
      ip_address: metadata.ipAddress,
      user_agent: metadata.userAgent
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}

/**
 * Create notification for user
 */
async function createNotification(userId, type, title, message, data = null) {
  await initSupabase();
  if (!supabase) return;
  
  try {
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        data,
        is_read: false
      })
      .select()
      .single();
    
    if (error) throw error;
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

/**
 * Get user by ID or email
 */
async function getUser(identifier) {
  await initSupabase();
  if (!supabase) return null;
  
  try {
    // Try by ID first (UUID format)
    if (identifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', identifier)
        .single();
      
      if (!error) return data;
    }
    
    // Try by name
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('name', identifier)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

/**
 * Get or create staff user
 * Note: For browser-based app, we'll use simplified staff management
 * without Supabase Auth (which requires service role key on server)
 */
async function getOrCreateStaffUser(name) {
  await initSupabase();
  if (!supabase) return { id: null, name };
  
  try {
    // Check if staff exists in staff table
    const { data: existingStaff, error: fetchError } = await supabase
      .from('staff')
      .select('*')
      .eq('name', name)
      .maybeSingle();
    
    if (existingStaff) {
      return existingStaff;
    }
    
    // Create new staff member
    const { data: newStaff, error: insertError } = await supabase
      .from('staff')
      .insert({
        name,
        role: 'staff',
        email: generateStaffEmail(name)
      })
      .select()
      .single();
    
    if (insertError) throw insertError;
    
    // Create default permissions
    await supabase.from('staff_permissions').insert({
      staff_id: newStaff.id,
      can_view_other_orders: false,
      allowed_staff_ids: []
    });
    
    return newStaff;
  } catch (error) {
    console.error('Error getting/creating staff user:', error);
    return { id: null, name };
  }
}

/**
 * Check staff permissions
 */
async function getStaffPermissions(staffId) {
  await initSupabase();
  if (!supabase) return { can_view_other_orders: false, allowed_staff_ids: [] };
  
  try {
    const { data, error } = await supabase
      .from('staff_permissions')
      .select('*')
      .eq('staff_id', staffId)
      .maybeSingle();
    
    if (!data) {
      // Create default permissions if not found
      const { data: newPerm } = await supabase
        .from('staff_permissions')
        .insert({
          staff_id: staffId,
          can_view_other_orders: false,
          allowed_staff_ids: []
        })
        .select()
        .single();
      
      return newPerm || { can_view_other_orders: false, allowed_staff_ids: [] };
    }
    
    return data;
  } catch (error) {
    console.error('Error getting staff permissions:', error);
    return { can_view_other_orders: false, allowed_staff_ids: [] };
  }
}

/**
 * Update staff permissions
 */
async function updateStaffPermissions(staffId, permissions) {
  await initSupabase();
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('staff_permissions')
      .update(permissions)
      .eq('staff_id', staffId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating staff permissions:', error);
    return null;
  }
}

/**
 * Subscribe to real-time changes
 */
async function subscribeToTable(table, callback, filter = null) {
  await initSupabase();
  if (!supabase) return null;
  
  let subscription = supabase
    .channel(`${table}_changes`)
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table,
        filter
      },
      callback
    )
    .subscribe();
  
  return subscription;
}

/**
 * Unsubscribe from real-time changes
 */
async function unsubscribe(subscription) {
  if (!supabase || !subscription) return;
  await supabase.removeChannel(subscription);
}

// Export functions to global scope for browser use
window.supabaseClient = {
  initSupabase,
  isSupabaseEnabled,
  createAuditLog,
  createNotification,
  getUser,
  getOrCreateStaffUser,
  getStaffPermissions,
  updateStaffPermissions,
  subscribeToTable,
  unsubscribe
};
