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
- **Fixed**: Changed from "22.18.0" to "22" in package.json
- **Result**: Eliminated build warnings
- **Note**: Vercel has since been deprecated in favor of Railway (see migration guide in openspec/archive/vercel/)

---

**Last Updated**: 2025-10-07
**Next Review**: Before next major release
