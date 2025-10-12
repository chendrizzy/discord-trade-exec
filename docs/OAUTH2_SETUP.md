# Discord OAuth2 Setup Guide

This guide will help you set up Discord OAuth2 authentication for the dashboard.

## Step 1: Access Discord Developer Portal

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Log in with your Discord account

## Step 2: Create or Select Application

### Option A: Use Existing Bot Application
1. Click on your existing "Trading Executor" application (the one with bot token)
2. This is recommended to keep everything in one application

### Option B: Create New Application (if preferred)
1. Click "New Application" button
2. Enter a name (e.g., "Trading Executor Dashboard")
3. Accept Terms of Service
4. Click "Create"

## Step 3: Configure OAuth2

1. In the left sidebar, click **OAuth2** → **General**
2. Under "Redirects", click **Add Redirect**
3. Enter: `http://localhost:3000/auth/discord/callback`
4. Click **Save Changes**

## Step 4: Get Credentials

1. Still in **OAuth2** → **General** page
2. Copy the **CLIENT ID** (you'll see it near the top)
3. Copy the **CLIENT SECRET** (click "Reset Secret" if you need a new one)

⚠️ **Important**: Never share your CLIENT_SECRET publicly!

## Step 5: Update .env File

Open your `.env` file and update these values:

```bash
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
```

Replace `your_client_id_here` and `your_client_secret_here` with the values you copied.

## Step 6: Test the Setup

1. Restart your application:
   ```bash
   npm start
   ```

2. Navigate to: `http://localhost:3000/auth/discord`

3. You should see Discord's OAuth2 authorization screen

4. Click "Authorize"

5. You should be redirected to `/dashboard`

## Troubleshooting

### "Invalid OAuth2 redirect_uri"
- Make sure you added the exact redirect URL: `http://localhost:3000/auth/discord/callback`
- Check for typos or extra spaces
- Verify you saved the changes in Discord Developer Portal

### "Invalid client_id" or "Invalid client_secret"
- Double-check you copied the correct values from Discord Developer Portal
- Make sure there are no extra spaces in your .env file
- Try resetting the client secret and copying the new one

### "Cannot connect to MongoDB"
- Make sure MongoDB connection is working (test with `node test-setup.js`)
- Session data is stored in MongoDB, so it must be connected

## Production Setup

When deploying to production, update the redirect URL to your production domain:

1. Go to Discord Developer Portal → OAuth2 → General
2. Add redirect: `https://yourdomain.com/auth/discord/callback`
3. Update `.env`:
   ```bash
   DISCORD_CALLBACK_URL=https://yourdomain.com/auth/discord/callback
   NODE_ENV=production
   ```

## Security Notes

- ✅ `SESSION_SECRET` and `ENCRYPTION_KEY` are auto-generated and secure
- ✅ Sessions are stored in MongoDB (persistent across restarts)
- ✅ Cookies are `httpOnly` (protected from XSS)
- ✅ Cookies are `secure` in production (HTTPS only)
- ✅ Sessions expire after 7 days

## Next Steps

Once OAuth2 is working:
1. Create HTML dashboard pages in `/public` directory
2. Build React components for risk management
3. Implement signal provider management
4. Add API endpoints for dashboard features
