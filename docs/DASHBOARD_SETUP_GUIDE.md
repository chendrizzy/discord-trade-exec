# Dashboard Setup Guide - Phase 2.1

## ✅ Completed Tasks

### 1. Dependencies Installed
- ✅ Vite 7.1.9 (React build tool)
- ✅ Tailwind CSS 4.1.14 (styling framework)
- ✅ @vitejs/plugin-react 5.0.4
- ✅ PostCSS & Autoprefixer
- ✅ All authentication dependencies (Passport, passport-discord, express-session, etc.)

### 2. Configuration Files Created
- ✅ `vite.config.js` - Vite configuration with React plugin and proxy setup
- ✅ `tailwind.config.js` - Tailwind CSS configuration with custom colors
- ✅ `postcss.config.js` - PostCSS configuration

### 3. React App Structure
```
src/dashboard/
├── index.html          # Entry HTML file
├── main.jsx            # React entry point
├── App.jsx             # Main app component
├── index.css           # Tailwind directives
├── components/         # Reusable UI components
├── pages/              # Dashboard pages
├── hooks/              # Custom React hooks
└── utils/              # Utility functions
```

### 4. Authentication System
- ✅ Passport Discord OAuth2 strategy (`src/middleware/auth.js`)
- ✅ Session management with MongoDB store
- ✅ Auth routes (`src/routes/auth.js`):
  - `/auth/discord` - Initiate login
  - `/auth/discord/callback` - OAuth2 callback
  - `/auth/logout` - Logout
  - `/auth/status` - Check auth status (for React)
  - `/auth/me` - Get current user info

### 5. Dashboard Routes
- ✅ Dashboard routes exist in `src/routes/dashboard.js`
- ✅ API routes for risk management (`src/routes/api/risk.js`)
- ✅ API routes for signal providers (`src/routes/api/providers.js`)

## 🔧 Required Setup Steps

### Step 1: Create Discord OAuth2 Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name it "Trading Bot Dashboard" (or your preferred name)
4. Navigate to "OAuth2" → "General"
5. Copy your **Client ID** and **Client Secret**
6. Add Redirect URL: `http://localhost:5000/auth/discord/callback`

### Step 2: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your Discord credentials:
   ```env
   DISCORD_CLIENT_ID=your_actual_client_id
   DISCORD_CLIENT_SECRET=your_actual_client_secret
   DISCORD_CALLBACK_URL=http://localhost:5000/auth/discord/callback
   SESSION_SECRET=generate_random_string_here
   PORT=5000
   ```

3. Generate a secure SESSION_SECRET:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

### Step 3: Start MongoDB

Ensure MongoDB is running:
```bash
# macOS with Homebrew
brew services start mongodb-community

# Or manually
mongod --dbpath /path/to/data
```

### Step 4: Start the Application

#### Option A: Run both servers concurrently (recommended for development)

Terminal 1 - Backend Server:
```bash
npm run dev
# Runs on http://localhost:5000
```

Terminal 2 - Frontend Dashboard:
```bash
npm run dev:dashboard
# Runs on http://localhost:3000
```

#### Option B: Build dashboard and serve from backend

```bash
npm run build:dashboard
npm start
# Everything runs on http://localhost:5000
```

### Step 5: Test Authentication Flow

1. Open browser to `http://localhost:3000`
2. You should see the login page
3. Click "Login with Discord"
4. Authorize the application
5. You should be redirected to the dashboard

## 📁 Package.json Scripts

```json
{
  "dev": "nodemon src/index.js",              // Backend dev server
  "dev:dashboard": "vite",                     // Frontend dev server
  "build:dashboard": "vite build",             // Build dashboard for production
  "preview:dashboard": "vite preview",         // Preview production build
  "start": "node src/index.js",                // Production server
  "test": "jest"                               // Run tests
}
```

## 🔍 Troubleshooting

### Issue: "Cannot GET /dashboard"
**Solution**: Make sure you're accessing the Vite dev server at `http://localhost:3000`, not the Express server at `http://localhost:5000`.

### Issue: "Authentication required" error
**Solution**:
1. Check that DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are correct in `.env`
2. Verify redirect URL matches in Discord Developer Portal
3. Check MongoDB is running
4. Clear browser cookies and try again

### Issue: Tailwind styles not working
**Solution**:
1. Make sure PostCSS and Tailwind are properly configured
2. Check that `index.css` has the Tailwind directives (@tailwind base, etc.)
3. Restart the Vite dev server

### Issue: CORS errors
**Solution**: The Vite config includes a proxy to forward `/api` and `/auth` requests to the backend. Make sure both servers are running.

## 🎯 Next Steps (Phase 2.4 - Security Hardening)

After testing the dashboard, the next tasks are:

1. ✅ Rate limiting middleware (already exists in `src/middleware/rateLimiter.js`)
2. ⏳ Implement API key encryption (AES-256-GCM)
3. ⏳ Add API permission validation for exchange keys
4. ⏳ Conduct security audit and penetration testing

## 📊 Current Status

- **Backend**: ✅ Complete (Express + MongoDB + Passport)
- **Frontend**: ✅ Complete (React + Vite + Tailwind)
- **Authentication**: ✅ Complete (Discord OAuth2)
- **Testing**: ⏳ Pending (requires Discord credentials)
- **Security**: ⏳ Phase 2.4

## 🚀 Quick Start Commands

```bash
# Install dependencies (if not done)
npm install

# Start MongoDB
brew services start mongodb-community

# Create .env file
cp .env.example .env
# Edit .env with your Discord credentials

# Start backend
npm run dev

# In another terminal, start dashboard
npm run dev:dashboard

# Open browser to http://localhost:3000
```

## 📝 Notes

- The React app runs on port 3000 (Vite dev server)
- The Express backend runs on port 5000
- Vite proxies `/api` and `/auth` requests to port 5000
- All authentication is handled by Passport Discord OAuth2
- Sessions are stored in MongoDB for persistence
- Dashboard is responsive and uses Tailwind CSS for styling
