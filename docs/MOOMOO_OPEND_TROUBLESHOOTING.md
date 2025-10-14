# Moomoo OpenD Gateway Troubleshooting Guide

**Date:** 2025-10-14
**Status:** Active Investigation
**Severity:** Connection Issue

---

## 🔍 Current Issue

MoomooAdapter implementation is complete (16/16 methods, 30/30 tests passing), but experiencing connection issues with OpenD Gateway during live testing.

---

## 📋 Investigation Summary

### Environment Details
- **OpenD Gateway**: Running and listening
- **Process ID**: 61104
- **Port**: 33333 (not the default 11111!)
- **WebSocket**: Active connection exists
- **moomoo-api package**: v9.4.5408

### Connection Investigation Steps

#### 1. Port Discovery ✅
**Issue**: Initial connection attempts were failing with timeout.

**Investigation**:
```bash
ps aux | grep -i opend
lsof -i :11111
netstat -an | grep 11111
```

**Finding**: OpenD Gateway is listening on port **33333**, not the default 11111.

**Resolution**: Updated .env to use port 33333.

#### 2. Connection Callback ✅
**Issue**: After fixing port, still timing out.

**Investigation**:
- Tested with raw moomoo-api (no adapter layer)
- Added dotenv to load environment variables
- Tested with empty password and configured password

**Finding**: OpenD process shows WebSocket key parameter:
```
-websocket_key_md5=abf880f22ba7e2a80e22ba0efdecd438
-websocket_port=33333
-login_pwd_md5=5df0b719295be39e06cf3e86a7c1b9ad
```

**Result**: onlogin callback IS being triggered, but with an error.

#### 3. API Package Error ❌ BLOCKING
**Issue**: Internal error in moomoo-api package.

**Error**:
```
TypeError: Cannot read properties of null (reading 'connID')
    at file:///node_modules/moomoo-api/base.js:408:54
```

**Code Analysis**:
```javascript
// Line 408 in base.js
this.connID = initResult.s2c.connID;
```

**Root Cause**: The InitWebSocket response from OpenD Gateway doesn't have the expected `s2c` structure, or `init Result.s2c` is null.

---

## 🐛 Root Cause IDENTIFIED ✅

**Version Incompatibility Confirmed:**

- **OpenD Gateway Version**: 9.4.5418 (running on user's machine)
- **moomoo-api npm Package**: 9.4.5408 (latest available, published Aug 2025)
- **Version Gap**: OpenD is **10 patch versions ahead** of the npm package

**Technical Details:**
- Gateway successfully receives InitWebSocket request
- Gateway **rejects** request with `retType: -1` (error code)
- Response contains NO `s2c` structure (expected to have `connID`)
- This indicates the gateway doesn't recognize the protocol format from the older API package

**Tested Solutions (All Failed):**
1. ✅ WebSocket key parameter - still returns `retType: -1`
2. ✅ Empty key parameter - still returns `retType: -1`
3. ✅ Port configuration (33333) - connection established but rejected
4. ✅ Latest npm package - already installed, no newer version available

**Why This Happens:**
Moomoo releases OpenD Gateway updates before publishing matching npm packages. The running gateway (5418) uses a newer protocol that the npm package (5408) doesn't support.

---

## 🔧 What We Tried

### Configuration Attempts
- ✅ Fixed port (11111 → 33333)
- ✅ Loaded environment variables
- ✅ Tested with raw moomoo-api (no adapter)
- ✅ Tested with empty password
- ✅ Tested with configured password
- ❌ WebSocket connection establishes but Init response is malformed

### Test Scripts Created
1. `test-moomoo-connection.js` - Full adapter test
2. `test-moomoo-raw.js` - Raw API test (bypasses adapter)

Both scripts encounter the same error at the moomoo-api package level.

---

## 📊 Comparison with IBKR

| Aspect | IBKR | Moomoo |
|--------|------|--------|
| **Implementation** | ✅ Complete | ✅ Complete |
| **Unit Tests** | ✅ 32/32 passing | ✅ 30/30 passing |
| **Live Connection** | ✅ Working | ❌ API Error |
| **Root Cause** | N/A | Package compatibility |

---

## 🚀 Recommended Solutions

### Option 1: Wait for Compatible npm Package (RECOMMENDED)
```bash
# Monitor for new moomoo-api releases
npm view moomoo-api time --json | tail -5

# When version 9.4.5418 or higher is published:
npm install moomoo-api@latest
```

**Status**: Waiting for Moomoo to publish compatible package
**ETA**: Unknown - depends on Moomoo's release schedule

### Option 2: Downgrade OpenD Gateway (IF AVAILABLE)
1. Check if older OpenD Gateway versions are available
2. Download OpenD Gateway v9.4.5408 or earlier
3. Uninstall current OpenD Gateway (v9.4.5418)
4. Install compatible version
5. Re-test connection

**Risks**:
- Older versions may have security vulnerabilities
- May lose newer features
- Compatibility downloads may not be readily available

### Option 3: Contact Moomoo Support
1. Visit: https://openapi.moomoo.com/
2. Report version mismatch: Gateway 9.4.5418 vs npm 9.4.5408
3. Request either:
   - Updated npm package for v9.4.5418
   - Compatible OpenD Gateway version for v9.4.5408
4. Ask for version compatibility matrix

### Option 4: Implement Custom WebSocket Client (ADVANCED)
Build direct WebSocket integration bypassing moomoo-api:
```javascript
const WebSocket = require('ws');
const protobuf = require('protobufjs');

// Implement custom InitWebSocket protocol
// Use Moomoo's protobuf definitions
// Handle authentication and message encoding manually
```

**Effort**: High (several days of development)
**Benefit**: Full control over protocol implementation

---

## 💡 Possible Solutions

### 1. WebSocket Key Authentication
The OpenD process shows a WebSocket key:
```
-websocket_key_md5=abf880f22ba7e2a80e22ba0efdecd438
```

This key might need to be passed during connection. Try:
```javascript
moomoo.start('127.0.0.1', 33333, false, 'websocket_key_here');
```

### 2. Check Protocol Buffer Definitions
The issue might be in proto.js - the protobuf definitions may need updating:
```bash
# Check if proto definitions need rebuild
ls -la node_modules/moomoo-api/proto.js
```

### 3. Direct WebSocket Connection
As a workaround, implement direct WebSocket connection bypassing the moomoo-api package:
```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:33333');
// Implement custom protocol handling
```

---

##  📝 Documentation Updates Needed

Once resolved, update:
1. ✅ `BROKER_INTEGRATION_STATUS.md` - Mark Moomoo as fully tested
2. 📝 `docs/MOOMOO_SETUP_GUIDE.md` - Create setup guide
3. 📝 `.env.example` - Update with correct default port
4. 📝 `README.md` - Add Moomoo to available brokers list

---

## 🎯 Implementation Status

### What's Complete ✅
- [x] MoomooAdapter.js (605 lines, all 16 methods)
- [x] Unit tests (30 tests, 100% pass rate)
- [x] BrokerFactory registration
- [x] Test scripts created
- [x] Port discovery (33333 not 11111)
- [x] Connection callback triggered

### What's Blocked ❌
- [ ] Live OpenD Gateway connection
- [ ] Real-time trading verification
- [ ] Production deployment

### Blocking Issue
External dependency issue in moomoo-api package (v9.4.5408) where `initResult.s2c` is null during InitWebSocket response parsing.

---

## 🔗 Useful Resources

- **Moomoo OpenAPI**: https://openapi.moomoo.com/
- **API Documentation**: https://openapi.moomoo.com/docs/
- **OpenD Gateway Download**: https://openapi.moomoo.com/
- **moomoo-api npm**: https://www.npmjs.com/package/moomoo-api
- **GitHub Issues**: Check for similar issues

---

## 📞 Support Channels

If this issue persists:
1. Check Moomoo OpenAPI forum/community
2. Contact Moomoo developer support
3. File issue on moomoo-api GitHub repository
4. Consider alternative broker integration

---

**Last Updated:** 2025-10-14
**Next Review:** After attempting package updates or OpenD Gateway version check
