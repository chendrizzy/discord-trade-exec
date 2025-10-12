# Design: Railway Migration Architecture

## Design Goals
1. **Single Source of Truth**: Railway as the canonical deployment platform
2. **Clear Migration Path**: Users on Vercel can easily migrate
3. **Maintainability**: Reduce dual-configuration burden
4. **Documentation Clarity**: Unambiguous deployment instructions

## Architecture Decisions

### Decision 1: Remove Vercel Configuration
**Rationale**: The application's architecture is better suited for Railway:
- **Long-running processes**: Discord bot maintains WebSocket connection
- **Session persistence**: Express sessions require stateful server
- **Background jobs**: Trade execution and market data processing
- **MongoDB integration**: Railway's native MongoDB support

**Alternatives Considered**:
- Keep both: Rejected due to maintenance overhead and user confusion
- Vercel-only: Rejected as serverless model doesn't fit application architecture

**Trade-offs**:
- ✅ Simplified deployment story
- ✅ Better performance for stateful application
- ❌ Users must migrate from Vercel (mitigated by migration guide)

### Decision 2: Archive vs Delete Vercel Files
**Approach**: Archive to `openspec/archive/vercel/` instead of deletion

**Rationale**:
- Preserve institutional knowledge
- Enable rollback if Railway issues arise
- Provide migration reference for existing Vercel users
- Comply with OpenSpec archival practices

**Archive Structure**:
```
openspec/archive/vercel/
├── vercel.json                    # Original configuration
├── migration-guide.md             # Vercel → Railway migration
└── deployment-docs-original.md    # Original Vercel deployment docs
```

### Decision 3: Environment Variables Naming
**Change**: `VERCEL-ENV-VARS.txt` → `RAILWAY-ENV-VARS.txt`

**Rationale**:
- File name was always a misnomer (contained general env vars, not Vercel-specific)
- Aligning name with primary deployment platform reduces confusion
- Template file already existed: `VERCEL-ENV-VARS.txt.example`

**Migration**:
- Rename `.example` file to `RAILWAY-ENV-VARS.txt.example`
- Update all documentation references
- Add note in migration guide about local file naming

### Decision 4: Documentation Structure
**Primary Deployment Docs** (`docs/DEPLOY-NOW.md`):
```markdown
## 🎯 Recommended: Railway Deployment
- Quick start instructions
- Environment variable setup
- Health check verification

## 📦 Alternative Platforms
- Heroku (still supported)
- Vercel (see migration guide in openspec/archive/)
```

**Rationale**:
- Railway first (primary recommendation)
- Heroku second (alternative PaaS option)
- Vercel referenced but not detailed (archived)

### Decision 5: Railway Configuration Enhancement
**Current** (`railway.toml`):
```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm start"
```

**Enhanced**:
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

**Additions**:
- Explicit build phases for clarity
- Restart policy for resilience
- Dashboard build step

## Data Flow Changes

### Before (Dual Configuration):
```
Developer
  ├── Reads docs/DEPLOY-NOW.md
  ├── Sees Vercel (recommended) and Railway options
  ├── Confused about which to choose
  └── May deploy to wrong platform
```

### After (Single Configuration):
```
Developer
  ├── Reads docs/DEPLOY-NOW.md
  ├── Follows Railway deployment (clear recommendation)
  ├── Optional: Checks archive/ for Vercel migration
  └── Successful deployment to Railway
```

## Component Dependencies

### Files Modified:
1. **Configuration Files**:
   - `railway.toml` (enhanced)
   - `package.json` (deployment scripts)
   - `.gitignore` (add .railway/)

2. **Documentation Files**:
   - `docs/DEPLOY-NOW.md` (rewrite Railway-first)
   - `docs/DEPLOYMENT.md` (update platform comparison)
   - `docs/PRE-DEPLOYMENT-CHECKLIST.md` (Railway checklist)
   - `docs/AUTOMATED-SETUP.md` (update scripts)
   - `README.md` (update badges and quick start)

3. **Project Files**:
   - `openspec/project.md` (deployment platforms section)
   - `quickstart.sh` (deployment commands)
   - `WARP.md` (deployment instructions)

### Files Archived:
- `vercel.json` → `openspec/archive/vercel/vercel.json`
- Vercel docs sections → `openspec/archive/vercel/deployment-docs-original.md`

### Files Removed:
- `.vercel/` directory (if exists)
- None others (everything archived)

## Error Handling

### Scenario: User Has Existing Vercel Deployment
**Detection**: User mentions Vercel in support request or GitHub issue

**Resolution Path**:
1. Direct to `openspec/archive/vercel/migration-guide.md`
2. Follow step-by-step migration instructions
3. Verify Railway deployment health

**Migration Guide Contents**:
- Export environment variables from Vercel
- Create Railway project
- Import environment variables to Railway
- Deploy to Railway
- Update Discord OAuth callback URLs
- Verify deployment
- (Optional) Delete Vercel project

### Scenario: Railway Deployment Fails
**Fallback Options**:
1. Check Railway logs: `railway logs`
2. Verify environment variables
3. Check `railway.toml` configuration
4. Consult Railway documentation
5. Alternative: Deploy to Heroku using `railway.toml` as reference

## Performance Considerations

### Railway Advantages:
- **Stateful Connections**: Native WebSocket support
- **Persistent Storage**: Better for session management
- **MongoDB Integration**: Direct connection to MongoDB Atlas
- **Build Caching**: Faster subsequent deployments

### Expected Improvements:
- Reduced cold start times (vs Vercel serverless)
- Better Discord bot reliability (persistent connection)
- Simplified deployment process (single platform)

## Security Considerations

### Environment Variables:
- Railway environment variables encrypted at rest
- Secrets not committed to repository
- Template file (`RAILWAY-ENV-VARS.txt.example`) contains placeholders only

### OAuth Callback URLs:
- Update Discord OAuth callback from `*.vercel.app` to `*.up.railway.app`
- Document URL update in migration guide
- No security implications (same OAuth flow)

## Testing Strategy

### Documentation Testing:
1. **Clarity Test**: Follow deployment docs from scratch
2. **Link Validation**: All internal links work
3. **Command Verification**: All CLI commands are correct

### Deployment Testing:
1. **Fresh Railway Deployment**: Deploy from clean Railway project
2. **Environment Variables**: Verify all required vars documented
3. **Health Check**: Test `/health` endpoint
4. **OAuth Flow**: Verify Discord authentication works

### Archive Testing:
1. **Migration Guide**: Follow Vercel → Railway migration
2. **File Accessibility**: Archived files readable and useful
3. **Reference Accuracy**: Archived configs match original

## Migration Rollback Plan

### If Railway Issues Arise:
1. **Short-term**: Restore Vercel configuration from `openspec/archive/vercel/`
2. **Medium-term**: Keep both platforms (revert proposal)
3. **Long-term**: Re-evaluate deployment platform strategy

### Rollback Steps:
```bash
# 1. Restore vercel.json
cp openspec/archive/vercel/vercel.json ./

# 2. Restore documentation
git revert <migration-commit>

# 3. Deploy to Vercel
vercel --prod
```

## Monitoring & Validation

### Post-Migration Metrics:
- **Deployment Success Rate**: Track Railway deployment success
- **Issue Reports**: Monitor user-reported deployment issues
- **Migration Requests**: Count Vercel → Railway migrations
- **Documentation Clarity**: User feedback on new docs

### Success Indicators:
- ✅ 95%+ deployment success rate on Railway
- ✅ < 5 Vercel-related support requests/month
- ✅ Clear, positive user feedback on documentation
- ✅ No rollback requests within first month

## Future Considerations

### Potential Enhancements:
1. **Railway Templates**: Create official Railway template for one-click deploy
2. **CI/CD Integration**: GitHub Actions → Railway auto-deploy
3. **Multi-Region**: Railway multi-region deployment for global users
4. **Observability**: Integrate Railway metrics with application monitoring

### Platform Alternatives:
- If Railway issues persist, consider: Render, Fly.io, or AWS Elastic Beanstalk
- Maintain flexible architecture that can deploy to multiple PaaS providers
