# Gokul Restaurant Management System

A complete multi-user restaurant management system with real-time synchronization, PWA support, Supabase integration, and thermal printer support.

## ✨ Latest Enhancements

### 🔄 PWA Improvements (v2.0.0)
- **Automatic Update Detection**: Get notified when a new version is available
- **One-Click Updates**: Update the app without losing your current work
- **Improved Offline Support**: Better caching strategy for reliable offline operation
- **Stable Refresh**: State is preserved during app updates and refreshes

### 🔐 Staff Permissions & Multi-User Controls
- **Order Isolation**: Staff members only see their own orders by default
- **Granular Permissions**: Owners can grant specific staff access to view other staff orders
- **Real-Time Updates**: Permission changes apply immediately across all devices
- **Clear Instructions**: Step-by-step guidance for staff and kitchen workflows

### ☁️ Supabase Backend Support
- **Cloud Database**: Optional Supabase integration for scalable cloud storage
- **Real-Time Sync**: Instant synchronization across all devices
- **Audit Logging**: Automatic tracking of all important actions
- **Row-Level Security**: Built-in security policies for data protection

See [SUPABASE_MIGRATION_GUIDE.md](./SUPABASE_MIGRATION_GUIDE.md) for detailed setup instructions.

## Features

### ✨ Core Features
- **Multi-user Support**: Multiple staff members can work simultaneously on different devices
- **Real-time Synchronization**: Orders, kitchen updates, and table status sync instantly across all devices
- **PWA (Progressive Web App)**: Install on phones, tablets, and desktops like a native app
- **Offline Support**: Continue working without internet, syncs when connection returns
- **Thermal Printer Support**: Print bills on 80mm thermal printers (ESC/POS)
- **Bill Management**: Store, search, and reprint bills

### 👥 User Roles
1. **Staff**: Manage tables, take orders, view performance
2. **Kitchen**: View pending orders, mark as ready
3. **Owner**: Full access to configuration, analytics, and management

### 📊 Analytics & Reporting
- Staff performance tracking
- Popular items analysis
- Daily and hourly sales reports
- Revenue trends and comparisons

## Installation

### Prerequisites
- Node.js 14+ installed
- Modern web browser (Chrome, Edge, Safari, or Firefox)
- (Optional) Supabase account for cloud database and real-time features

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/iamvivek907/GokulTableManagementApp.git
   cd GokulTableManagementApp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment (Optional - for Supabase)**
   
   Create a `.env` file in the root directory:
   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   PORT=3000
   NODE_ENV=development
   ```
   
   **Without Supabase**: The app will automatically use SQLite as a fallback database.

4. **Start the server**
   ```bash
   npm start
   ```

5. **Access the application**
   - Open your browser and navigate to: `http://localhost:3000`
   - For mobile devices on same network: `http://<your-ip>:3000`

### Supabase Setup (Optional but Recommended for Production)

For cloud database, real-time sync, and multi-device support:

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Note your project URL and API keys

2. **Run the Database Schema**
   - Open Supabase SQL Editor
   - Copy contents from `supabase-schema.sql`
   - Run the SQL to create all tables and policies

3. **Configure Environment Variables**
   - Add your Supabase credentials to `.env` file (see above)
   - Or configure GitHub Secrets for deployment (see below)

4. **Enable Real-time**
   - In Supabase Dashboard: Database → Replication
   - Enable replication for tables: `orders`, `kitchen_orders`, `staff_permissions`, `notifications`

### GitHub Pages Deployment

1. **Configure GitHub Secrets**
   
   In your repository: Settings → Secrets and variables → Actions
   
   Add these secrets:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon public key
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key

2. **Deploy**
   ```bash
   git push origin main
   ```
   
   GitHub Actions will automatically deploy to GitHub Pages.

### Production Deployment (Self-Hosted)

For self-hosted production deployment:

1. **Install PM2 (Process Manager)**
   ```bash
   npm install -g pm2
   ```

2. **Start with PM2**
   ```bash
   pm2 start server.js --name "gokul-restaurant"
   pm2 save
   pm2 startup
   ```

3. **Setup HTTPS** (Required for PWA)
   - Use nginx or Apache as reverse proxy
   - Configure SSL certificate (Let's Encrypt recommended)

4. **Configure Firewall**
   ```bash
   sudo ufw allow 3000/tcp  # Or your chosen port
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

5. **Regular Backups**
   - Setup automated database backups
   - Store backups securely offsite

## Usage

### First Time Setup

1. **Login as Owner**
   - Click "Owner / Manager"
   - Default password: `gokul2024`

2. **Configure Restaurant**
   - Set number of tables
   - Upload or add menu items
   - Add staff members

3. **Install as PWA** (Optional but recommended)
   - On mobile: Tap browser menu → "Add to Home Screen"
   - On desktop: Look for install icon in address bar

### Staff Workflow

1. Login with your name
2. Select a table
3. Add items from menu
4. Send batch to kitchen
5. When ready, collect and serve
6. Complete order and print bill

### Kitchen Workflow

1. Select "Kitchen Display System"
2. View pending orders in real-time
3. Mark orders as ready when complete

### Printing Bills

**Option 1: Thermal Printer (80mm)**
- Connect USB thermal printer
- Browser will request permission to access serial port
- Print bills directly from the app

**Option 2: Browser Print**
- If thermal printer not available
- Uses standard browser print dialog
- Optimized for 80mm paper width

## Configuration

### Change Owner Password

Edit `server.js` and modify the settings initialization:
```javascript
insertSetting.run('owner_password', 'your-new-password');
```

### Adjust Table Count

Login as owner → Configure tab → Change table count

### Menu Management

- **Upload CSV**: Prepare a CSV file with format: `Category,ItemName,Price`
- **Add Individual Items**: Use the add item form
- **Remove Items**: Click remove button next to items

## Database

The application supports two database modes:

### SQLite Mode (Default Fallback)
- Uses local SQLite database (`restaurant.db`)
- Automatically created on first run
- Perfect for single-device or local network usage
- No internet connection required

### Supabase Mode (Recommended for Production)
- Cloud PostgreSQL database
- Real-time synchronization across all devices
- Row-level security policies
- Automatic audit logging
- Scalable and reliable

See `supabase-schema.sql` for the complete database schema.

### Backup & Restore

**For SQLite:**
- Use the owner dashboard "Backup" tab
- Download JSON backups regularly
- Store backups securely

**For Supabase:**
- Backups managed automatically by Supabase
- Download backups from Supabase Dashboard
- Point-in-time recovery available

## Technology Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (No frameworks for maximum performance)
- **Backend**: Node.js + Express
- **Database**: 
  - SQLite (better-sqlite3) - Local fallback
  - Supabase PostgreSQL - Cloud option
- **Real-time**: 
  - WebSockets (ws) - Server-to-client
  - Supabase Realtime - Cloud sync
- **PWA**: Service Workers, Web App Manifest
- **State Management**: Custom state manager with offline queue
- **Printer Support**: Web Serial API for thermal printers

## Browser Compatibility

- ✅ Chrome/Edge 90+
- ✅ Safari 14+
- ✅ Firefox 88+
- ⚠️ Thermal printing requires Chrome/Edge (Web Serial API)

## Troubleshooting

### Cannot connect to server
- Ensure server is running (`npm start`)
- Check firewall settings
- Verify correct IP address for remote access

### WebSocket connection fails
- Check browser console for errors
- Ensure no proxy/firewall blocking WebSocket connections

### Thermal printer not working
- Use Chrome or Edge browser
- Ensure printer is connected via USB
- Grant serial port permission when prompted

### PWA won't install
- Requires HTTPS in production
- Check browser console for manifest errors
- Ensure all PWA requirements are met

## Support

For issues and feature requests, please create an issue on GitHub.

## License

MIT License - see LICENSE file for details.

## Credits

Developed by iamvivek907
