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

## 🐛 Current Problem

The moomoo-api package is attempting to access `initResult.s2c.connID` but `initResult.s2c` is null. This suggests one of the following:

1. **API Version Mismatch**: The installed moomoo-api v9.4.5408 may not be compatible with the running version of OpenD Gateway
2. **Response Format Change**: OpenD Gateway may be sending a different response structure
3. **WebSocket Key Required**: The connection may require the websocket_key_md5 from the OpenD process
4. **Protocol Version Issue**: The protobuf protocol definitions may be out of sync

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

## 🚀 Recommended Next Steps

### Option 1: Update moomoo-api Package (RECOMMENDED)
```bash
# Check for updates
npm outdated moomoo-api

# Try latest version
npm install moomoo-api@latest

# Or try specific versions
npm install moomoo-api@9.5.x
```

### Option 2: Check OpenD Gateway Version
1. Check OpenD Gateway version in the application
2. Compare with moomoo-api package requirements
3. Update OpenD Gateway if needed
4. Restart OpenD Gateway after any updates

### Option 3: Consult Moomoo Documentation
1. Visit: https://openapi.moomoo.com/docs/
2. Check API version compatibility matrix
3. Review connection examples for current OpenD version
4. Check if WebSocket key parameter is required

### Option 4: Alternative API Package
Consider using a different Moomoo API package if available:
- Check npm for alternative packages
- Review Moomoo's official GitHub repositories
- Consider using REST API if WebSocket continues to fail

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
