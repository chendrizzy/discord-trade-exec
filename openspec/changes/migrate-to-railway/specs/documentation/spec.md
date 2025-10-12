# Spec: Documentation Migration to Railway

## MODIFIED Requirements

### R-DOC-001: Primary Deployment Documentation
**Status**: MODIFIED
**Previous Behavior**: `docs/DEPLOY-NOW.md` recommended Vercel as "fastest" deployment option
**New Behavior**: `docs/DEPLOY-NOW.md` recommends Railway as primary deployment platform

**Rationale**: Railway better suits the application's architecture with long-running processes, WebSocket support, and stateful sessions

#### Scenario: Developer reads deployment quick start
**Given** a developer wants to deploy the application
**When** they open `docs/DEPLOY-NOW.md`
**Then** Railway should be listed first as "🎯 Recommended: Railway Deployment"
**And** Heroku should be listed as "📦 Alternative: Heroku Deployment"
**And** Vercel should have brief note: "💡 Migrating from Vercel? See openspec/archive/vercel/migration-guide.md"

### R-DOC-002: Platform Comparison Documentation
**Status**: MODIFIED
**Previous Behavior**: `docs/DEPLOYMENT.md` listed Vercel, Railway, and Heroku as equal options
**New Behavior**: `docs/DEPLOYMENT.md` positions Railway as recommended with clear rationale

**Rationale**: Provide clear guidance to developers on why Railway is the best choice

#### Scenario: Developer compares deployment platforms
**Given** a developer is evaluating deployment options
**When** they read `docs/DEPLOYMENT.md`
**Then** they should see a "Platform Comparison" table with:
```markdown
| Feature            | Railway | Heroku | Vercel |
|--------------------|---------|--------|--------|
| WebSocket Support  | ✅      | ✅     | ⚠️ Limited |
| Stateful Sessions  | ✅      | ✅     | ❌     |
| Long-running Jobs  | ✅      | ✅     | ❌     |
| MongoDB Integration| ✅      | ✅     | ⚠️     |
| Ease of Setup      | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐  | ⭐⭐⭐⭐  |
| **Recommended**    | ✅      | Alternative | See Archive |
```
**And** see explanation: "Railway is recommended due to native support for Discord bot's persistent WebSocket connections and Express session management."

### R-DOC-003: Environment Variables Setup Guide
**Status**: MODIFIED
**Previous Behavior**: Documentation referenced `VERCEL-ENV-VARS.txt`
**New Behavior**: Documentation references `RAILWAY-ENV-VARS.txt`

**Rationale**: Align environment variable naming with primary deployment platform

#### Scenario: Developer sets up environment variables
**Given** a developer needs environment variable setup instructions
**When** they follow deployment documentation
**Then** all references should point to `RAILWAY-ENV-VARS.txt.example`
**And** instructions should say "Copy RAILWAY-ENV-VARS.txt.example to RAILWAY-ENV-VARS.txt"
**And** no references to `VERCEL-ENV-VARS.txt` should exist in primary docs

### R-DOC-004: OAuth Callback URL Examples
**Status**: MODIFIED
**Previous Behavior**: Documentation showed `https://your-app.vercel.app/auth/discord/callback`
**New Behavior**: Documentation shows `https://your-app.up.railway.app/auth/discord/callback`

**Rationale**: Match OAuth examples with primary deployment platform

#### Scenario: Developer configures Discord OAuth
**Given** a developer is setting up Discord OAuth
**When** they read OAuth setup instructions
**Then** callback URL examples should use Railway domain format
**And** include note: "Railway provides *.up.railway.app domains by default"
**And** explain how to configure custom domains

### R-DOC-005: Deployment Checklist
**Status**: MODIFIED
**Previous Behavior**: `docs/PRE-DEPLOYMENT-CHECKLIST.md` had Vercel-specific steps
**New Behavior**: `docs/PRE-DEPLOYMENT-CHECKLIST.md` focuses on Railway deployment

**Rationale**: Ensure pre-deployment checklist matches primary platform

#### Scenario: Developer completes pre-deployment checklist
**Given** a developer is preparing for production deployment
**When** they review `docs/PRE-DEPLOYMENT-CHECKLIST.md`
**Then** checklist should include:
- [ ] Create Railway account
- [ ] Install Railway CLI: `npm install -g @railway/cli`
- [ ] Set up MongoDB Atlas database
- [ ] Configure environment variables in Railway dashboard
- [ ] Update Discord OAuth callback URLs
- [ ] Test deployment with `railway up`
- [ ] Verify health check: `curl https://your-app.up.railway.app/health`
**And** no Vercel-specific steps should be present

### R-DOC-006: Quick Start Scripts
**Status**: MODIFIED
**Previous Behavior**: `quickstart.sh` included Vercel deployment commands
**New Behavior**: `quickstart.sh` uses Railway CLI

**Rationale**: Automated quick start should use recommended platform

#### Scenario: Developer runs quick start script
**Given** a developer runs `./quickstart.sh`
**When** the script reaches deployment step
**Then** it should check for Railway CLI: `command -v railway`
**And** offer to install if missing: `npm install -g @railway/cli`
**And** guide through Railway login: `railway login`
**And** deploy with: `railway up`

### R-DOC-007: README Quick Start
**Status**: MODIFIED
**Previous Behavior**: `README.md` had no specific deployment platform recommendation
**New Behavior**: `README.md` prominently features Railway deployment

**Rationale**: First impression should direct users to optimal platform

#### Scenario: Developer reads project README
**Given** a new developer discovers the project
**When** they read `README.md`
**Then** they should see deployment badge: `[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/...)`
**And** "Quick Start" section should reference Railway
**And** include one-line deploy command: `railway up`

### R-DOC-008: Marketing Setup Documentation
**Status**: MODIFIED
**Previous Behavior**: `docs/MARKETING-SETUP.md` assumed Vercel deployment for webhook URLs
**New Behavior**: `docs/MARKETING-SETUP.md` uses Railway domain examples

**Rationale**: Marketing automation webhooks should use correct production URLs

#### Scenario: Developer configures marketing webhooks
**Given** a developer sets up marketing automation
**When** they configure webhook URLs in external services
**Then** documentation should show Railway URL examples:
- Twitter: `https://your-app.up.railway.app/webhook/twitter`
- Reddit: `https://your-app.up.railway.app/webhook/reddit`
- Email: `https://your-app.up.railway.app/webhook/email`
**And** explain Railway domain format

### R-DOC-009: Project Context Documentation
**Status**: MODIFIED
**Previous Behavior**: `openspec/project.md` listed "Recommended: Railway, Heroku, or any Node.js hosting"
**New Behavior**: `openspec/project.md` clearly states "Recommended: Railway"

**Rationale**: Project documentation should reflect deployment platform decision

#### Scenario: AI agent reads project context
**Given** an AI agent is working on the project
**When** it reads `openspec/project.md`
**Then** it should see:
```markdown
### Deployment Platforms
- **Recommended:** Railway (WebSocket support, stateful sessions, long-running processes)
- **Alternative:** Heroku (fully supported, production-ready)
- **Historical:** Vercel (archived - see openspec/archive/vercel/ for migration)
```

## ADDED Requirements

### R-DOC-010: Vercel Migration Guide
**Status**: ADDED
**New Behavior**: Create comprehensive migration guide for users transitioning from Vercel to Railway

**Rationale**: Support existing Vercel users with clear migration path

#### Scenario: Vercel user migrates to Railway
**Given** a user has existing Vercel deployment
**When** they read `openspec/archive/vercel/migration-guide.md`
**Then** they should find step-by-step instructions:
1. **Export Vercel environment variables**
   ```bash
   vercel env pull .env.vercel
   ```

2. **Create Railway project**
   ```bash
   railway login
   railway init
   ```

3. **Import environment variables to Railway**
   ```bash
   # Manual import via Railway dashboard or CLI
   railway variables set DISCORD_BOT_TOKEN="..."
   ```

4. **Update Discord OAuth callback**
   - Old: `https://your-app.vercel.app/auth/discord/callback`
   - New: `https://your-app.up.railway.app/auth/discord/callback`

5. **Deploy to Railway**
   ```bash
   railway up
   ```

6. **Verify deployment**
   ```bash
   curl https://your-app.up.railway.app/health
   ```

7. **(Optional) Delete Vercel project**
   ```bash
   vercel remove your-app-name
   ```

### R-DOC-011: Archived Vercel Documentation
**Status**: ADDED
**New Behavior**: Preserve original Vercel deployment documentation in archive

**Rationale**: Maintain institutional knowledge and provide reference for edge cases

#### Scenario: User needs Vercel reference
**Given** a user needs Vercel-specific information
**When** they browse `openspec/archive/vercel/`
**Then** they should find:
- `vercel.json` - Original Vercel configuration
- `deployment-docs-original.md` - Original Vercel deployment instructions
- `migration-guide.md` - Step-by-step Vercel → Railway migration

### R-DOC-012: Railway Deployment Badge
**Status**: ADDED
**New Behavior**: Add "Deploy on Railway" badge to README

**Rationale**: Enable one-click deployment for new users

#### Scenario: User wants one-click deployment
**Given** a user visits the GitHub repository
**When** they see README.md
**Then** they should see Railway deployment badge at top of README
**And** clicking badge should initiate Railway deployment template
**And** pre-populate environment variables based on Railway template config

## REMOVED Requirements

### R-DOC-013: Vercel Deployment as Primary Option
**Status**: REMOVED
**Previous Behavior**: Vercel presented as "fastest" or "recommended" deployment option

**Rationale**: Railway is better suited for the application architecture

**Migration**: Vercel references moved to archive with migration guide

#### Scenario: Developer looks for Vercel instructions
**Given** a developer wants Vercel deployment instructions
**When** they search main documentation
**Then** they should find brief reference in `docs/DEPLOY-NOW.md`
**And** be directed to `openspec/archive/vercel/migration-guide.md`
**And** understand Railway is the recommended path forward

## Implementation Notes

### Documentation Files Modified:
- `docs/DEPLOY-NOW.md` - Complete rewrite with Railway-first approach
- `docs/DEPLOYMENT.md` - Update platform comparison table
- `docs/PRE-DEPLOYMENT-CHECKLIST.md` - Railway-specific checklist
- `docs/AUTOMATED-SETUP.md` - Update setup scripts
- `docs/MARKETING-SETUP.md` - Railway webhook URLs
- `README.md` - Add Railway badge, update quick start
- `openspec/project.md` - Update deployment platforms section
- `quickstart.sh` - Railway CLI integration
- `WARP.md` - Update deployment instructions

### Documentation Files Created:
- `openspec/archive/vercel/migration-guide.md` - Vercel → Railway migration
- `openspec/archive/vercel/deployment-docs-original.md` - Archived Vercel docs
- `openspec/archive/vercel/README.md` - Archive index

### Search and Replace Patterns:
- `vercel.app` → `up.railway.app` (in URL examples)
- `VERCEL-ENV-VARS.txt` → `RAILWAY-ENV-VARS.txt`
- `vercel --prod` → `railway up`
- `vercel logs` → `railway logs`

### Quality Checks:
- [ ] No broken internal links
- [ ] All command examples are correct
- [ ] Railway domain format consistent
- [ ] Migration guide is complete and tested
- [ ] Archive is properly organized
