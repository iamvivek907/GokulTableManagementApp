// Supabase Client Configuration and Helper Functions
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('⚠️  Supabase credentials not found. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env file.');
  console.warn('⚠️  Falling back to SQLite mode. To use Supabase, configure your .env file.');
}

const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true
      }
    })
  : null;

/**
 * Check if Supabase is configured and available
 */
function isSupabaseEnabled() {
  return supabase !== null;
}

/**
 * Create audit log entry
 */
async function createAuditLog(userId, action, entityType, entityId, oldValues, newValues, metadata = {}) {
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
 * Note: Uses temporary email addresses for staff members.
 * In production, consider implementing proper user registration flow.
 */
async function getOrCreateStaffUser(name) {
  if (!supabase) return { id: null, name };
  
  try {
    // Check if user exists
    let user = await getUser(name);
    
    if (!user) {
      // Create new staff user in Supabase Auth
      // Sanitize name for email: remove special chars, convert spaces to dots
      const sanitizedName = name.toLowerCase()
        .replace(/[^a-z0-9\s]/gi, '')  // Remove special characters
        .replace(/\s+/g, '.');  // Replace spaces with dots
      const email = `${sanitizedName}@gokul-staff.local`;
      
      // Generate secure random password using crypto
      const crypto = require('crypto');
      const password = `staff_${crypto.randomBytes(8).toString('hex')}`;
      
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role: 'staff' }
      });
      
      if (authError) throw authError;
      
      // Create user profile
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .insert({
          id: authUser.user.id,
          name,
          role: 'staff'
        })
        .select()
        .single();
      
      if (profileError) throw profileError;
      
      // Create default permissions
      await supabase.from('staff_permissions').insert({
        staff_id: authUser.user.id,
        can_view_all_orders: false,
        allowed_staff_ids: []
      });
      
      user = profile;
    }
    
    return user;
  } catch (error) {
    console.error('Error getting/creating staff user:', error);
    return { id: null, name };
  }
}

/**
 * Check staff permissions
 */
async function getStaffPermissions(staffId) {
  if (!supabase) return { can_view_all_orders: false, allowed_staff_ids: [] };
  
  try {
    const { data, error } = await supabase
      .from('staff_permissions')
      .select('*')
      .eq('staff_id', staffId)
      .single();
    
    if (error) {
      // Create default permissions if not found
      const { data: newPerm } = await supabase
        .from('staff_permissions')
        .insert({
          staff_id: staffId,
          can_view_all_orders: false,
          allowed_staff_ids: []
        })
        .select()
        .single();
      
      return newPerm || { can_view_all_orders: false, allowed_staff_ids: [] };
    }
    
    return data;
  } catch (error) {
    console.error('Error getting staff permissions:', error);
    return { can_view_all_orders: false, allowed_staff_ids: [] };
  }
}

/**
 * Update staff permissions
 */
async function updateStaffPermissions(staffId, permissions) {
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
function subscribeToTable(table, callback, filter = null) {
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

module.exports = {
  supabase,
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
