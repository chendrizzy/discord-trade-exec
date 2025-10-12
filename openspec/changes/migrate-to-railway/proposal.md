# Proposal: Migrate from Vercel to Railway

## Overview
Migrate the Discord Trade Executor platform from Vercel to Railway as the primary deployment target, ensuring all configuration files, documentation, and environment variable templates reflect Railway as the recommended hosting platform.

## Motivation
- **Unified deployment target**: Railway better suits the application's architecture with WebSocket support, long-running processes, and MongoDB integration
- **Consistency**: Current codebase already has `railway.toml` and Railway-specific configuration
- **Simplification**: Reduce confusion from having both Vercel and Railway deployment options
- **Repository cleanup**: Archive Vercel-specific files to maintain clean project structure

## Context
The project currently has dual deployment configuration:
- Vercel configuration: `vercel.json`, `.vercel/` directory, Vercel-centric deployment docs
- Railway configuration: `railway.toml`, Railway CLI references
- Environment variables file named `VERCEL-ENV-VARS.txt` (misnomer for general env vars)

The `docs/DEPLOY-NOW.md` currently recommends Vercel as the "fastest" option, but Railway is better aligned with the application's requirements:
- Discord bot requires persistent connection (WebSocket)
- Express server with session management
- MongoDB integration
- Background job processing

## Proposed Changes

### 1. Update Deployment Configuration
- **Remove**: `vercel.json` (archive to `openspec/archive/`)
- **Remove**: `.vercel/` directory if it exists
- **Enhance**: `railway.toml` with comprehensive build and deploy configuration
- **Rename**: `VERCEL-ENV-VARS.txt.example` → `RAILWAY-ENV-VARS.txt.example`

### 2. Update Documentation
- **Modify**: `docs/DEPLOY-NOW.md` - Make Railway the recommended deployment method
- **Modify**: `docs/DEPLOYMENT.md` - Update Railway as primary, move Vercel to "Alternative Platforms"
- **Modify**: `docs/PRE-DEPLOYMENT-CHECKLIST.md` - Update deployment checklist for Railway
- **Modify**: `docs/AUTOMATED-SETUP.md` - Update setup scripts to reference Railway
- **Modify**: `docs/MARKETING-SETUP.md` - Update marketing automation deployment references
- **Modify**: `README.md` - Update quick start and deployment badge

### 3. Update Project Configuration
- **Modify**: `package.json` - Update deployment scripts
- **Modify**: `openspec/project.md` - Update deployment platforms section
- **Modify**: `quickstart.sh` - Update deployment commands
- **Modify**: `WARP.md` - Update deployment instructions

### 4. Archive Vercel Assets
Create `openspec/archive/vercel/` directory containing:
- Original `vercel.json`
- Vercel deployment documentation sections
- Migration guide for users currently on Vercel

## Success Criteria
- [ ] No references to Vercel in primary documentation
- [ ] Railway positioned as recommended deployment platform
- [ ] All environment variable references updated (RAILWAY-ENV-VARS.txt)
- [ ] Vercel files archived with migration guide
- [ ] `openspec validate migrate-to-railway --strict` passes
- [ ] Documentation clearly guides users to Railway deployment
- [ ] Heroku remains as alternative option in docs

## Dependencies
None - this is primarily a documentation and configuration change.

## Risks & Mitigation
- **Risk**: Users currently deployed on Vercel may be confused
  - **Mitigation**: Provide clear migration guide in archive directory
  - **Mitigation**: Keep Vercel as "Alternative Platform" section in docs

- **Risk**: Breaking existing Vercel deployments
  - **Mitigation**: This only affects new deployments; existing Vercel projects continue to work
  - **Mitigation**: Archive contains all original Vercel configuration for reference

## Timeline
- **Estimated Effort**: 2-3 hours
- **Implementation**: Single PR with all changes
- **Testing**: Validate documentation accuracy, ensure Railway deployment works

## Related Work
- Current Railway configuration: `railway.toml`
- Environment variables template: `VERCEL-ENV-VARS.txt.example` (to be renamed)
- Deployment documentation: `docs/DEPLOY-NOW.md`, `docs/DEPLOYMENT.md`
