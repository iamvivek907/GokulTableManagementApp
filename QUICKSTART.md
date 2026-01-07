# Quick Start Guide

## Installation & Setup

### 1. First Time Setup

```bash
# Install dependencies
npm install

# Start the server
npm start
```

The server will start on port 3000. You'll see:
```
Server running on port 3000
Open http://localhost:3000 in your browser
```

### 2. Access the Application

- **On same computer**: `http://localhost:3000`
- **On other devices (same network)**: `http://192.168.x.x:3000`
  - Replace with your computer's IP address
  - Find your IP: 
    - Windows: `ipconfig`
    - Mac/Linux: `ifconfig` or `ip addr show`

### 3. Login

#### Staff Login
1. Click "Staff / Team Member"
2. Enter your name
3. Click Login

#### Owner Login
1. Click "Owner / Manager"
2. Enter password: `gokul2024`
3. Click Login

#### Kitchen Display
1. Click "Kitchen Display System"
2. No password required

## Basic Workflow

### For Staff

1. **Select a Table** → Click on any empty table
2. **Add Items** → Click menu items to add to order
3. **Send to Kitchen** → Click "Send" button to send batch
4. **Wait for Ready** → You'll get notification when food is ready
5. **Complete Order** → Click "Complete & Print" to finish and print bill

### For Kitchen

1. **View Pending Orders** → Shows all new orders
2. **Mark Ready** → Click "Ready" button when food is prepared
3. **Staff Gets Notified** → Staff automatically notified

### For Owner

1. **Configure** → Set number of tables, change settings
2. **Menu** → Add/remove menu items, upload CSV
3. **Staff** → Add/remove staff members
4. **Bills** → View and reprint past bills
5. **Analytics** → View sales trends, popular items, peak hours

## Install as PWA (App)

### On Mobile (Android/iOS)
1. Open the site in browser
2. Tap menu (⋮ or ⚙️)
3. Select "Add to Home Screen" or "Install App"
4. Confirm installation
5. App icon appears on home screen

### On Desktop (Chrome/Edge)
1. Open the site
2. Look for install icon in address bar
3. Click and confirm
4. App opens in its own window

## Bill Printing

### Option 1: Thermal Printer (Recommended)
1. Connect 80mm USB thermal printer
2. Complete an order
3. Click "Complete & Print"
4. Browser will ask for permission to access printer
5. Allow access
6. Bill prints automatically

**Supported**: Chrome, Edge (Web Serial API required)

### Option 2: Browser Print (Fallback)
1. If thermal printer not available
2. Bill opens in new window
3. Use browser print (Ctrl+P / Cmd+P)
4. Optimized for 80mm width

## Troubleshooting

### Server won't start
```bash
# Check if port 3000 is in use
# On Windows:
netstat -ano | findstr :3000
# On Mac/Linux:
lsof -i :3000

# If in use, kill the process or change port:
PORT=3001 npm start
```

### Can't connect from other devices
- Check firewall settings
- Ensure all devices on same Wi-Fi network
- Verify server is running
- Use computer's IP address, not localhost

### WebSocket connection fails
- Check browser console for errors
- Ensure no VPN or proxy blocking connections
- Try refreshing the page

### Database errors
```bash
# Reset database (WARNING: Deletes all data)
rm restaurant.db*
npm start
```

### Thermal printer not working
- Use Chrome or Edge browser (not Firefox/Safari)
- Ensure printer is USB connected
- Check printer is turned on
- Grant serial port permission when prompted

## Default Data

### Default Menu
The system comes with 17 default menu items across categories:
- Appetizers
- Breads
- Main Course

### Default Settings
- Tables: 4
- Owner Password: `gokul2024`
- Restaurant Name: Gokul Restaurant
- Tax Rate: 0%

### Changing Settings
1. Login as Owner
2. Go to Configure tab
3. Update as needed
4. Click Save

## Data Backup

### Automatic
- All data stored in SQLite database
- File: `restaurant.db`
- Backup this file regularly

### Manual Export
1. Login as Owner
2. Go to Backup tab
3. Click "Create Full Backup"
4. Click "Download"
5. Save JSON file

### Restore
1. Login as Owner
2. Go to Backup tab
3. Choose backup JSON file
4. Click "Restore"
5. Confirm action

## Production Deployment

### Requirements
- Node.js 14+
- HTTPS (for PWA features)
- Stable internet connection
- Firewall configured

### Recommended Setup
```bash
# Install PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start server.js --name "restaurant"

# Auto-restart on server reboot
pm2 startup
pm2 save

# View logs
pm2 logs restaurant
```

### HTTPS Setup
For PWA to work in production, you need HTTPS:

1. Get SSL certificate (Let's Encrypt - free)
2. Use reverse proxy (nginx/Apache)
3. Or deploy to hosting service (Heroku, Railway, etc.)

### Security Checklist
- [ ] Change owner password
- [ ] Enable HTTPS
- [ ] Configure firewall
- [ ] Set up regular backups
- [ ] Restrict database access
- [ ] Monitor server logs

## Support

For issues:
1. Check server console for errors
2. Check browser console (F12)
3. Review logs
4. Create GitHub issue with details

## Updates

To update the application:
```bash
git pull origin main
npm install
npm start
```

Database will automatically migrate if needed.
