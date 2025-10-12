# Spec: Deployment Configuration Migration

## REMOVED Requirements

### R-DEPLOY-001: Vercel Configuration File
**Status**: REMOVED
**Previous Behavior**: Project included `vercel.json` with Vercel-specific build and routing configuration

**Rationale**: Railway uses Nixpacks builder which automatically detects Node.js projects. Vercel configuration is no longer needed as Railway is the primary deployment platform.

**Migration**: File archived to `openspec/archive/vercel/vercel.json` for reference

#### Scenario: Developer attempts Vercel deployment
**Given** a developer tries to deploy to Vercel
**When** they look for `vercel.json`
**Then** they should find migration guide in `openspec/archive/vercel/migration-guide.md`
**And** be directed to Railway deployment instructions

### R-DEPLOY-002: Vercel Directory
**Status**: REMOVED
**Previous Behavior**: `.vercel/` directory contained Vercel deployment metadata

**Rationale**: Directory is Vercel-specific and not needed for Railway deployments

**Migration**: Directory removed (regenerated automatically by Vercel CLI if user needs it)

#### Scenario: Clean project structure
**Given** a fresh clone of the repository
**When** developer lists project files
**Then** no `.vercel/` directory should exist
**And** only Railway configuration files should be present

### R-DEPLOY-003: Vercel-Centric Environment Variable Template
**Status**: REMOVED
**Previous Behavior**: `VERCEL-ENV-VARS.txt.example` implied Vercel-specific variables

**Rationale**: File name created confusion as it contained general environment variables, not Vercel-specific ones

**Migration**: Renamed to `RAILWAY-ENV-VARS.txt.example` with same content structure

#### Scenario: Developer sets up environment variables
**Given** a developer needs to configure environment variables
**When** they look for environment variable templates
**Then** they should find `RAILWAY-ENV-VARS.txt.example`
**And** the file should contain platform-agnostic environment variables
**And** no Vercel-specific variables should be present

## ADDED Requirements

### R-DEPLOY-004: Enhanced Railway Configuration
**Status**: ADDED
**New Behavior**: `railway.toml` includes comprehensive build phases, restart policies, and health checks

**Rationale**: Explicit Railway configuration improves deployment reliability and clarity

#### Scenario: Railway deployment with build phases
**Given** the project is deployed to Railway
**When** Railway builds the application
**Then** it should run `npm install` in setup phase
**And** it should run `npm run build:dashboard` in build phase
**And** it should start with `npm start` command

#### Scenario: Railway deployment restart policy
**Given** the application crashes on Railway
**When** the deployment fails
**Then** Railway should automatically restart the application
**And** use "on_failure" restart policy
**And** retry up to 10 times before giving up

### R-DEPLOY-005: Railway Environment Variable Template
**Status**: ADDED
**New Behavior**: `RAILWAY-ENV-VARS.txt.example` provides Railway-specific deployment guidance

**Rationale**: Align environment variable naming with primary deployment platform

#### Scenario: Railway environment setup
**Given** a developer is deploying to Railway
**When** they need to configure environment variables
**Then** they should copy `RAILWAY-ENV-VARS.txt.example` to `RAILWAY-ENV-VARS.txt`
**And** fill in actual values from their credentials
**And** the callback URL should use Railway's domain format (`*.up.railway.app`)

### R-DEPLOY-006: Deployment Platform Git Ignore
**Status**: ADDED
**New Behavior**: `.gitignore` includes `.railway/` directory exclusion

**Rationale**: Railway CLI generates local metadata that shouldn't be committed

#### Scenario: Railway metadata not committed
**Given** a developer uses Railway CLI
**When** Railway generates `.railway/` directory
**Then** git should ignore the directory
**And** the directory should not be staged for commit

## MODIFIED Requirements

### R-DEPLOY-007: Primary Deployment Target
**Status**: MODIFIED
**Previous Behavior**: No single recommended deployment platform; both Vercel and Railway presented as equal options
**New Behavior**: Railway is the primary and recommended deployment platform

**Rationale**: Railway better aligns with application architecture (WebSocket, stateful, long-running processes)

#### Scenario: Developer reads deployment documentation
**Given** a developer wants to deploy the application
**When** they read `docs/DEPLOY-NOW.md`
**Then** Railway should be presented first as "Recommended"
**And** Heroku should be listed as "Alternative"
**And** Vercel should reference migration guide in archive

### R-DEPLOY-008: Deployment Script Commands
**Status**: MODIFIED
**Previous Behavior**: `package.json` included no specific deployment scripts
**New Behavior**: `package.json` includes Railway-specific deployment helpers

**Rationale**: Streamline deployment workflow for developers

#### Scenario: Developer uses npm scripts for deployment
**Given** a developer wants to deploy to Railway
**When** they run `npm run deploy:railway`
**Then** the script should execute `railway up`
**And** verify environment variables are set
**And** confirm successful deployment

### R-DEPLOY-009: OAuth Callback URL Domain
**Status**: MODIFIED
**Previous Behavior**: Documentation referenced `*.vercel.app` callback URLs
**New Behavior**: Documentation uses `*.up.railway.app` callback URLs

**Rationale**: Align OAuth configuration with primary deployment platform

#### Scenario: Discord OAuth configuration
**Given** a developer sets up Discord OAuth
**When** they configure callback URLs
**Then** the example should use `https://your-app.up.railway.app/auth/discord/callback`
**And** documentation should explain Railway domain format
**And** Vercel migration guide should explain URL update process

## Implementation Notes

### Files Modified:
- `railway.toml` - Enhanced configuration
- `.gitignore` - Add `.railway/` exclusion
- `package.json` - Add deployment scripts
- `VERCEL-ENV-VARS.txt.example` → `RAILWAY-ENV-VARS.txt.example` - Renamed

### Files Archived:
- `vercel.json` → `openspec/archive/vercel/vercel.json`

### Files Removed:
- `.vercel/` directory (if exists)

### Backward Compatibility:
- Existing Vercel deployments continue to function
- Migration guide provided for Vercel → Railway transition
- No breaking changes to application code
