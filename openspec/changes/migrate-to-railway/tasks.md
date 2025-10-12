# Tasks: Migrate from Vercel to Railway

## Task Order
Tasks are ordered for sequential execution with dependencies noted. Some tasks can be parallelized as indicated.

---

## Phase 1: Archive Preparation (Parallel: Tasks 1-2)

### Task 1: Create archive directory structure
**Capability**: N/A (Infrastructure)
**Estimated Time**: 5 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes (with Task 2)

**Actions**:
```bash
mkdir -p openspec/archive/vercel
```

**Validation**:
- [ ] Directory `openspec/archive/vercel/` exists
- [ ] Directory is empty and ready for files

---

### Task 2: Archive vercel.json
**Capability**: deployment-config (R-DEPLOY-001)
**Estimated Time**: 5 minutes
**Dependencies**: Task 1
**Can Run in Parallel**: Yes (with Task 1)

**Actions**:
```bash
cp vercel.json openspec/archive/vercel/vercel.json
```

**Validation**:
- [ ] `openspec/archive/vercel/vercel.json` exists
- [ ] File content matches original `vercel.json`
- [ ] File contains Vercel version 2 configuration

---

## Phase 2: Documentation Archive (Sequential: Tasks 3-4)

### Task 3: Extract and archive Vercel deployment documentation
**Capability**: documentation (R-DOC-011)
**Estimated Time**: 20 minutes
**Dependencies**: Task 1
**Can Run in Parallel**: No

**Actions**:
1. Extract Vercel-specific sections from `docs/DEPLOY-NOW.md`
2. Create `openspec/archive/vercel/deployment-docs-original.md`
3. Include original Vercel deployment instructions
4. Include environment variable setup for Vercel
5. Include OAuth callback configuration for Vercel

**Validation**:
- [ ] `openspec/archive/vercel/deployment-docs-original.md` exists
- [ ] File contains complete Vercel deployment instructions
- [ ] File includes Vercel CLI commands
- [ ] File includes environment variable setup
- [ ] File includes OAuth URL examples with `.vercel.app`

---

### Task 4: Create Vercel migration guide
**Capability**: documentation (R-DOC-010)
**Estimated Time**: 30 minutes
**Dependencies**: Task 3
**Can Run in Parallel**: No

**Actions**:
1. Create `openspec/archive/vercel/migration-guide.md`
2. Write step-by-step Vercel → Railway migration instructions
3. Include environment variable export/import steps
4. Include OAuth callback URL update instructions
5. Include deployment verification steps
6. Add troubleshooting section

**Template**:
```markdown
# Migrating from Vercel to Railway

## Why Migrate?
Railway better supports the application architecture...

## Prerequisites
- [ ] Existing Vercel deployment
- [ ] Railway account
- [ ] Railway CLI installed

## Migration Steps
1. Export Vercel environment variables
2. Create Railway project
3. Import environment variables
4. Update Discord OAuth callbacks
5. Deploy to Railway
6. Verify deployment
7. (Optional) Remove Vercel project

## Troubleshooting
...
```

**Validation**:
- [ ] `openspec/archive/vercel/migration-guide.md` exists
- [ ] All 7 migration steps are documented
- [ ] Each step has specific commands
- [ ] OAuth callback update is clearly explained
- [ ] Troubleshooting section is comprehensive

---

### Task 5: Create archive README
**Capability**: documentation (R-DOC-011)
**Estimated Time**: 10 minutes
**Dependencies**: Tasks 3, 4
**Can Run in Parallel**: No

**Actions**:
1. Create `openspec/archive/vercel/README.md`
2. Explain why Vercel files are archived
3. Link to migration guide
4. List archived files

**Template**:
```markdown
# Vercel Archive

## Purpose
This directory contains archived Vercel deployment configuration...

## Why Railway?
Railway was chosen as the primary deployment platform because...

## Archived Files
- `vercel.json` - Original Vercel configuration
- `deployment-docs-original.md` - Original Vercel deployment docs
- `migration-guide.md` - Step-by-step migration guide

## Migrating from Vercel?
See [migration-guide.md](migration-guide.md) for detailed instructions.
```

**Validation**:
- [ ] `openspec/archive/vercel/README.md` exists
- [ ] Explains purpose of archive
- [ ] Lists all archived files
- [ ] Links to migration guide

---

## Phase 3: Configuration Updates (Parallel: Tasks 6-9)

### Task 6: Remove vercel.json from project root
**Capability**: deployment-config (R-DEPLOY-001)
**Estimated Time**: 2 minutes
**Dependencies**: Task 2 (after archiving)
**Can Run in Parallel**: Yes

**Actions**:
```bash
git rm vercel.json
```

**Validation**:
- [ ] `vercel.json` no longer exists in project root
- [ ] File is staged for deletion in git
- [ ] Archive copy still exists in `openspec/archive/vercel/`

---

### Task 7: Remove .vercel directory
**Capability**: deployment-config (R-DEPLOY-002)
**Estimated Time**: 2 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes

**Actions**:
```bash
rm -rf .vercel/
```

**Validation**:
- [ ] `.vercel/` directory no longer exists
- [ ] No Vercel metadata in project

---

### Task 8: Enhance railway.toml configuration
**Capability**: deployment-config (R-DEPLOY-004)
**Estimated Time**: 15 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes

**Actions**:
1. Open `railway.toml`
2. Add explicit build phases
3. Add restart policy
4. Add health check configuration

**Target Configuration**:
```toml
[build]
builder = "NIXPACKS"

[build.nixpacksPlan.phases.setup]
cmds = ["npm install"]

[build.nixpacksPlan.phases.build]
cmds = ["npm run build:dashboard"]

[deploy]
startCommand = "npm start"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10
```

**Validation**:
- [ ] `railway.toml` includes build phases
- [ ] `railway.toml` includes restart policy
- [ ] Setup phase runs `npm install`
- [ ] Build phase runs `npm run build:dashboard`
- [ ] Start command is `npm start`
- [ ] Restart policy is "on_failure" with 10 retries

---

### Task 9: Update .gitignore for Railway
**Capability**: deployment-config (R-DEPLOY-006)
**Estimated Time**: 5 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes

**Actions**:
1. Open `.gitignore`
2. Add `.railway/` directory exclusion
3. Verify `.vercel/` is no longer needed (can optionally keep)

**Changes**:
```diff
# Build outputs
dist/
.vercel/
+.railway/
```

**Validation**:
- [ ] `.gitignore` includes `.railway/` exclusion
- [ ] Git ignores `.railway/` directory

---

### Task 10: Rename environment variable template file
**Capability**: deployment-config (R-DEPLOY-005)
**Estimated Time**: 5 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes

**Actions**:
```bash
git mv VERCEL-ENV-VARS.txt.example RAILWAY-ENV-VARS.txt.example
```

**Validation**:
- [ ] `RAILWAY-ENV-VARS.txt.example` exists
- [ ] `VERCEL-ENV-VARS.txt.example` no longer exists
- [ ] File content is unchanged (still contains same env vars)
- [ ] Rename is staged in git

---

## Phase 4: Documentation Updates (Sequential: Tasks 11-18)

### Task 11: Update docs/DEPLOY-NOW.md
**Capability**: documentation (R-DOC-001)
**Estimated Time**: 30 minutes
**Dependencies**: Tasks 4, 8
**Can Run in Parallel**: No

**Actions**:
1. Rewrite first section as "🎯 Recommended: Railway Deployment"
2. Move Heroku to "📦 Alternative: Heroku Deployment"
3. Add brief Vercel note with link to migration guide
4. Update all command examples to Railway CLI
5. Update environment variable references to `RAILWAY-ENV-VARS.txt`
6. Update OAuth callback URLs to `*.up.railway.app`
7. Update health check URLs to Railway domains

**Section Structure**:
```markdown
# 🚀 Ready to Deploy

## 🎯 Recommended: Railway Deployment (Fastest)
### Step 1: Install Railway CLI
### Step 2: Login to Railway
### Step 3: Deploy to Production
### Step 4: Configure Environment Variables

## 📦 Alternative: Heroku Deployment
...

## 💡 Migrating from Vercel?
See our comprehensive [Vercel → Railway migration guide](../openspec/archive/vercel/migration-guide.md)
```

**Validation**:
- [ ] Railway is listed first as "Recommended"
- [ ] All Railway CLI commands are correct
- [ ] All URL examples use `*.up.railway.app`
- [ ] All env var references use `RAILWAY-ENV-VARS.txt`
- [ ] Vercel migration link is present
- [ ] Health check examples use Railway domains

---

### Task 12: Update docs/DEPLOYMENT.md
**Capability**: documentation (R-DOC-002)
**Estimated Time**: 20 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes (after Task 11)

**Actions**:
1. Add platform comparison table
2. Position Railway as recommended
3. Update deployment instructions for Railway
4. Move Vercel to "Historical Platforms" section

**Platform Comparison Table**:
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

**Validation**:
- [ ] Platform comparison table is present
- [ ] Railway has most favorable ratings
- [ ] Explanation of why Railway is recommended
- [ ] Vercel section references archive

---

### Task 13: Update docs/PRE-DEPLOYMENT-CHECKLIST.md
**Capability**: documentation (R-DOC-005)
**Estimated Time**: 15 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes

**Actions**:
1. Replace Vercel checklist items with Railway items
2. Update CLI installation command
3. Update environment variable file references
4. Update OAuth callback examples

**Checklist Items**:
- [ ] Create Railway account at railway.app
- [ ] Install Railway CLI: `npm install -g @railway/cli`
- [ ] Set up MongoDB Atlas database
- [ ] Copy `RAILWAY-ENV-VARS.txt.example` to `RAILWAY-ENV-VARS.txt`
- [ ] Fill in actual values in `RAILWAY-ENV-VARS.txt`
- [ ] Update Discord OAuth callback to `https://your-app.up.railway.app/auth/discord/callback`
- [ ] Deploy with `railway up`
- [ ] Verify health check: `curl https://your-app.up.railway.app/health`

**Validation**:
- [ ] All checklist items use Railway
- [ ] No Vercel references remain
- [ ] All URLs use Railway domain format

---

### Task 14: Update docs/AUTOMATED-SETUP.md
**Capability**: documentation (R-DOC-003)
**Estimated Time**: 15 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes

**Actions**:
1. Update automated setup scripts to check for Railway CLI
2. Update environment variable references
3. Update deployment commands

**Validation**:
- [ ] Setup scripts check for Railway CLI
- [ ] All env var references use `RAILWAY-ENV-VARS.txt`
- [ ] Deployment uses `railway up`

---

### Task 15: Update docs/MARKETING-SETUP.md
**Capability**: documentation (R-DOC-008)
**Estimated Time**: 10 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes

**Actions**:
1. Update webhook URL examples to Railway domain format
2. Replace `.vercel.app` with `.up.railway.app`

**URL Examples**:
- Twitter: `https://your-app.up.railway.app/webhook/twitter`
- Reddit: `https://your-app.up.railway.app/webhook/reddit`
- Email: `https://your-app.up.railway.app/webhook/email`

**Validation**:
- [ ] All webhook URLs use Railway domain
- [ ] Domain format is explained

---

### Task 16: Update README.md
**Capability**: documentation (R-DOC-007, R-DOC-012)
**Estimated Time**: 20 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes

**Actions**:
1. Add Railway deployment badge at top
2. Update Quick Start section with Railway instructions
3. Update deployment section with Railway as primary

**Railway Badge**:
```markdown
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/...)
```

**Quick Start Update**:
```markdown
## 🚀 Quick Start

### Deploy to Railway (Recommended)
```bash
railway up
```

### Or deploy manually...
```

**Validation**:
- [ ] Railway badge is visible at top of README
- [ ] Quick Start prominently features Railway
- [ ] One-line deployment command is present
- [ ] Railway is clearly marked as recommended

---

### Task 17: Update openspec/project.md
**Capability**: documentation (R-DOC-009)
**Estimated Time**: 10 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes

**Actions**:
1. Update "Deployment Platforms" section
2. Position Railway as recommended
3. Mark Vercel as "Historical"

**Target Content**:
```markdown
### Deployment Platforms
- **Recommended:** Railway (WebSocket support, stateful sessions, long-running processes)
- **Alternative:** Heroku (fully supported, production-ready)
- **Historical:** Vercel (archived - see openspec/archive/vercel/ for migration)
- **Database:** MongoDB Atlas (managed)
- **CDN:** Not required (self-hosted static assets via Express)
- **Domain:** Custom domain required for production OAuth callbacks
```

**Validation**:
- [ ] Railway listed as "Recommended"
- [ ] Vercel listed as "Historical"
- [ ] Clear rationale for Railway recommendation
- [ ] Archive reference for Vercel

---

### Task 18: Update quickstart.sh
**Capability**: documentation (R-DOC-006)
**Estimated Time**: 20 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes

**Actions**:
1. Replace Vercel CLI checks with Railway CLI checks
2. Update deployment commands
3. Update environment variable file name

**Changes**:
```diff
-# Check for Vercel CLI
-if ! command -v vercel &> /dev/null; then
-  echo "Vercel CLI not found. Installing..."
-  npm install -g vercel
+# Check for Railway CLI
+if ! command -v railway &> /dev/null; then
+  echo "Railway CLI not found. Installing..."
+  npm install -g @railway/cli
 fi

-echo "Deploying to Vercel..."
-vercel --prod
+echo "Deploying to Railway..."
+railway up
```

**Validation**:
- [ ] Script checks for Railway CLI
- [ ] Script offers to install Railway CLI if missing
- [ ] Deployment uses `railway up`
- [ ] All env var references use `RAILWAY-ENV-VARS.txt`

---

## Phase 5: Package Configuration (Sequential: Task 19)

### Task 19: Update package.json
**Capability**: deployment-config (R-DEPLOY-008)
**Estimated Time**: 10 minutes
**Dependencies**: Tasks 8, 10
**Can Run in Parallel**: No

**Actions**:
1. Add Railway deployment scripts
2. Remove any Vercel-specific scripts
3. Add Railway CLI helper commands

**Scripts to Add**:
```json
{
  "scripts": {
    "deploy:railway": "railway up",
    "logs:railway": "railway logs",
    "railway:status": "railway status",
    "railway:env": "railway variables"
  }
}
```

**Validation**:
- [ ] `deploy:railway` script exists
- [ ] `logs:railway` script exists
- [ ] Scripts work when Railway CLI is installed
- [ ] No Vercel-specific scripts remain

---

## Phase 6: Final Updates (Parallel: Tasks 20-21)

### Task 20: Update WARP.md
**Capability**: documentation
**Estimated Time**: 10 minutes
**Dependencies**: None
**Can Run in Parallel**: Yes

**Actions**:
1. Update deployment instructions to Railway
2. Update URL examples

**Validation**:
- [ ] Deployment section references Railway
- [ ] All URLs use Railway domain format

---

### Task 21: Global search and replace verification
**Capability**: documentation (R-DOC-003)
**Estimated Time**: 15 minutes
**Dependencies**: All previous tasks
**Can Run in Parallel**: No

**Actions**:
1. Search for remaining "vercel" references (case-insensitive)
2. Verify all are intentional (archive references)
3. Search for `.vercel.app` and replace with `.up.railway.app`
4. Search for `VERCEL-ENV-VARS` and replace with `RAILWAY-ENV-VARS`

**Search Commands**:
```bash
# Find all remaining vercel references
rg -i "vercel" --type md

# Find .vercel.app URLs
rg "\.vercel\.app" --type md

# Find env var references
rg "VERCEL-ENV-VARS" --type-add 'docs:*.{md,sh,js}' -t docs
```

**Validation**:
- [ ] Only intentional Vercel references remain (in archive and changelog)
- [ ] No `.vercel.app` URLs in primary docs
- [ ] All env var references use `RAILWAY-ENV-VARS`

---

## Phase 7: Testing & Validation (Sequential: Tasks 22-24)

### Task 22: Test Railway deployment locally
**Capability**: deployment-config (R-DEPLOY-004)
**Estimated Time**: 30 minutes
**Dependencies**: All configuration updates
**Can Run in Parallel**: No

**Actions**:
1. Ensure Railway CLI is installed
2. Create test Railway project
3. Set environment variables
4. Deploy with `railway up`
5. Verify health check endpoint
6. Test Discord OAuth flow

**Validation**:
- [ ] Deployment succeeds without errors
- [ ] Health check returns 200 OK
- [ ] Discord OAuth redirects correctly
- [ ] Application functions normally

---

### Task 23: Verify documentation accuracy
**Capability**: documentation
**Estimated Time**: 20 minutes
**Dependencies**: All documentation updates
**Can Run in Parallel**: No

**Actions**:
1. Follow `docs/DEPLOY-NOW.md` step-by-step
2. Verify all commands work
3. Check all internal links
4. Verify all URL examples

**Validation**:
- [ ] All Railway CLI commands are correct
- [ ] All internal links work
- [ ] All URL examples use correct format
- [ ] No broken links to archived content

---

### Task 24: Run OpenSpec validation
**Capability**: All
**Estimated Time**: 5 minutes
**Dependencies**: All tasks
**Can Run in Parallel**: No

**Actions**:
```bash
openspec validate migrate-to-railway --strict
```

**Validation**:
- [ ] No validation errors
- [ ] All requirements are satisfied
- [ ] All scenarios are covered
- [ ] Archive is properly structured

---

## Summary

### Total Estimated Time: 4-5 hours

### Task Dependencies:
- **Critical Path**: Tasks 1 → 3 → 4 → 11 → 24 (migration guide must exist before updating docs)
- **Parallelizable**: Tasks 6-10 (configuration), Tasks 12-18 (documentation)
- **Must Be Last**: Tasks 21-24 (verification)

### Completion Criteria:
- [ ] All Vercel files archived
- [ ] Railway configuration enhanced
- [ ] All documentation updated
- [ ] Migration guide complete
- [ ] OpenSpec validation passes
- [ ] Test deployment succeeds
- [ ] No broken links
- [ ] All tasks completed and validated
