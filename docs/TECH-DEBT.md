# Technical Debt

## Dependency Updates

### ✅ RESOLVED: glob and inflight deprecation warnings
- **Fixed**: Updated jest from v29 → v30
- **Added**: npm override to force glob@10.4.5 across all packages
- **Result**: All glob warnings eliminated

### ⚠️ TODO: passport-discord deprecation
- **Issue**: `passport-discord@0.1.4` is deprecated and no longer maintained
- **Warning**: "This package is no longer maintained. Please consider migrating to a maintained alternative"
- **Alternatives**: `discord-strategy`, `passport-discord-auth` (unvetted by author)
- **Risk**: Changing authentication packages requires thorough testing
- **Priority**: Low - package still works, but should migrate when time permits
- **Migration Steps**:
  1. Research and evaluate maintained alternatives
  2. Set up test environment
  3. Migrate authentication logic
  4. Test OAuth flow thoroughly
  5. Update environment variables if needed
  6. Deploy and monitor

### ✅ RESOLVED: Node version specification
- **Fixed**: Changed from "22.18.0" to "22" in both package.json and vercel.json
- **Result**: Eliminated Vercel build warnings

### ℹ️ INFO: Vercel builds warning
- **Warning**: "Due to `builds` existing in your configuration file, the Build and Development Settings defined in your Project Settings will not apply"
- **Status**: This is expected and intentional
- **Reason**: We use explicit `vercel.json` configuration for custom build settings
- **Action**: No action needed - this is correct behavior

---

**Last Updated**: 2025-10-07
**Next Review**: Before next major release
