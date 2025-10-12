# Vercel Deployment Archive

This directory contains archived Vercel deployment configuration and documentation for the Discord Trade Executor platform.

## Archive Date

**Archived**: 2025-10-12
**Reason**: Migration to Railway as primary deployment platform
**Migration Guide**: See `migration-guide.md` in this directory

## Why Railway Instead of Vercel?

The Discord Trade Executor platform requires:

1. **Persistent WebSocket Connections**: Discord bot maintains long-running WebSocket connection
2. **Stateful Sessions**: Express session management works better with traditional hosting
3. **Long-Running Processes**: Bot and webhook listeners need to stay active continuously
4. **Build Flexibility**: Complex build pipeline for dashboard + bot + backend

Railway's architecture better aligns with these requirements compared to Vercel's serverless model.

## Archived Files

### `vercel.json`
Original Vercel deployment configuration using `@vercel/node` builder.

**Contents**:
- Node.js 22 runtime
- Routes all requests to `src/index.js`
- Serverless function configuration

### `VERCEL-ENV-VARS.txt`
Template for environment variables when deploying to Vercel.

**Note**: These environment variables are platform-agnostic and work with Railway/Heroku as well. The filename was a misnomer - it contained general application environment variables, not Vercel-specific ones.

### `deployment-instructions.md`
Step-by-step Vercel deployment guide extracted from `docs/DEPLOY-NOW.md`.

**Sections included**:
- Vercel CLI installation
- Environment variable configuration
- Discord OAuth setup
- Deployment verification steps
- Troubleshooting guide

## Migration Path

If you have an existing Vercel deployment and want to migrate to Railway:

1. **Read the migration guide**: `migration-guide.md` in this directory
2. **Export your environment variables** from Vercel Dashboard
3. **Follow the 7-step migration process** in the guide
4. **Keep Vercel deployment** as staging until Railway is verified

## Rollback Instructions

To restore Vercel deployment:

```bash
# 1. Copy vercel.json back to project root
cp openspec/archive/vercel/vercel.json ./

# 2. Redeploy to Vercel
npm install -g vercel
vercel login
vercel --prod

# 3. Update Discord OAuth callback
# Go to Discord Developer Portal and update redirect URL back to:
# https://your-app-name.vercel.app/auth/discord/callback
```

## When to Use Vercel

Vercel is still a great platform for:

- **Serverless APIs**: Stateless REST endpoints
- **Static Sites**: Next.js, React, Vue.js applications
- **Edge Functions**: Global CDN with minimal cold starts
- **Jamstack Projects**: Pre-rendered content with API routes

However, for this specific application (Discord bot + Express + WebSocket), Railway provides a better fit.

## Support

- **Current Deployment Docs**: `docs/DEPLOY-NOW.md` (Railway-first)
- **Migration Questions**: See `migration-guide.md`
- **Railway vs Vercel**: See `openspec/changes/migrate-to-railway/design.md`

## Historical Context

The Discord Trade Executor platform was initially designed with Vercel as the primary deployment target because:

1. Vercel offers excellent developer experience
2. Quick deployments with zero configuration
3. Built-in HTTPS and custom domains
4. Great for MVP and rapid prototyping

As the platform evolved to include:
- Persistent Discord bot connection
- Real-time WebSocket updates
- Long-running webhook listeners
- Stateful Express sessions

It became clear that a traditional hosting platform (Railway) would be more appropriate.

This archive preserves the Vercel deployment knowledge for:
- Historical reference
- Users who may still prefer Vercel for development/staging
- Rollback capability if needed
- Documentation of architectural decisions

---

**Archive Maintained By**: OpenSpec Migration System
**Last Updated**: 2025-10-12
**Migration Status**: Complete
