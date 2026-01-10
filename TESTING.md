# Testing Guide - Gokul Restaurant Management System

##  Setup & Prerequisites

### Local Development (No Deployment)
```javascript
// Open browser console and set:
localStorage.setItem('SUPABASE_URL', 'your_url');
localStorage.setItem('SUPABASE_ANON_KEY', 'your_key');
// Refresh page
```

### GitHub Pages Deployment
1. Add GitHub Secrets: SUPABASE_URL, SUPABASE_ANON_KEY
2. Push to main branch → Auto-deploys
3. Test at: `https://username.github.io/GokulTableManagementApp/`

### Supabase Setup
1. Create project at supabase.com
2. Run `supabase-schema-simple.sql` in SQL Editor
3. Enable Realtime: orders, kitchen_orders, staff_permissions, settings

## 🎯 Critical Tests (Must Pass)

### ✅ Test 1: Zero 404 Errors
**DevTools → Network → Filter "404"**
- ✅ NO 404 for index.html
- ✅ NO 404 for manifest.json
- ✅ NO 404 for service-worker.js
- ✅ NO 404 for icons
- ✅ NO 404 for JavaScript files (all embedded!)

### ✅ Test 2: Zero Console Errors
**DevTools → Console → Check for red errors**
- ✅ Supabase initializes
- ✅ No undefined variables
- ✅ All functions load correctly

### ✅ Test 3: All Roles Work
- Staff login → Dashboard loads
- Kitchen display → Interface loads
- Owner login → Dashboard loads

### ✅ Test 4: Real-Time Sync (< 2 sec)
- Staff creates order → Kitchen receives instantly
- Kitchen marks ready → Staff notified instantly

### ✅ Test 5: PWA Installs
- Install prompt appears
- App installs successfully
- Launches in standalone mode

## 📋 Detailed Test Scenarios

### Staff Workflow
1. Login as "Alice"
2. Click Table 1
3. Add: Samosa ×2, French Fries ×1
4. Send to Kitchen
5. Kitchen marks ready
6. Complete & Print Bill
**Expected**: Bill shows ₹66, Table resets to Empty

### Kitchen Display
1. Open kitchen interface (no login)
2. Wait for order from staff
3. Verify order details visible
4. Mark as ready
**Expected**: Order moves to Ready tab, staff notified

### Owner Dashboard
1. Login with password "owner123"
2. Configure → Change tables to 6 → Save
3. Menu → Add "Cold Coffee" ₹45
4. Manage → Grant permissions to staff
5. Analytics → View reports
**Expected**: All changes sync to other users immediately

### Multi-User Test
- Browser 1: Staff "Alice" creates order
- Browser 2: Kitchen sees order (< 2 sec)
- Browser 3: Owner sees in dashboard
**Expected**: Real-time sync, no conflicts

## 🔧 Troubleshooting

### "Supabase not configured"
- Check GitHub Secrets set
- Verify workflow completed
- Check deployed index.html for {{placeholders}}

### 404 Errors
- All paths should be relative: `./file` not `/file`
- No external `<script src=` tags (all embedded)

### Real-Time Not Working
- Enable Realtime in Supabase Dashboard → Replication
- Check WebSocket connection in DevTools → Network → WS

### PWA Won't Install
- Verify HTTPS enabled
- Check manifest.json loads (not 404)
- Check service-worker registered

## ✅ Success Criteria

- [ ] Zero 404 errors
- [ ] Zero console errors
- [ ] All 3 roles functional
- [ ] Real-time sync < 2 sec
- [ ] PWA installs
- [ ] Multi-user works
- [ ] Bills generate correctly
- [ ] Analytics display

## 📊 Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| Page Load | < 3s | ⬜ |
| Sync Latency | < 2s | ⬜ |
| Bundle Size | < 200KB | ✅ 160KB |

## 🎬 Test Report

**Date**: _______
**Tester**: _______
**URL**: _______

Critical Tests:
- [ ] Zero 404s
- [ ] Zero errors
- [ ] Roles work
- [ ] Real-time works
- [ ] PWA installs

**Sign-off**: _______ ✅ Ready for Production

**Version**: 3.0.0 (Single-File PWA)
