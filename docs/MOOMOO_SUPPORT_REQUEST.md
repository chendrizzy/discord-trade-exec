# Moomoo OpenAPI Support Request

**Date:** October 14, 2025
**Account ID:** 72635647
**Issue:** WebSocket API Access Not Activated After Questionnaire Completion

---

## Issue Summary

I completed the required API Questionnaire and Agreements earlier today (over 2 hours ago), but my account is still unable to access the WebSocket API through OpenD Gateway. According to the [official documentation](https://openapi.moomoo.com/moomoo-api-doc/en/intro/authority.html), API quotas should be "automatically assigned within 2 hours" for new accounts, but this has not occurred.

---

## Technical Details

### Environment
- **OpenD Gateway Version:** 9.4.5408 (build 20250713104500)
- **moomoo-api Package:** 9.4.5408 (npm)
- **Platform:** macOS 26.0
- **Connection Type:** WebSocket (port 33333)

### Current Status
- ✅ **Account Login:** Successful (account 72635647 logged into gateway)
- ✅ **Regular API (port 11111):** Working (Telnet/InitConnect protocol)
- ❌ **WebSocket API (port 33333):** Rejected with `retType: -1`
- ❌ **API Whitelist:** Account 72635647 NOT present in FreqLimitMooMoo.json

### Error Details

When attempting to connect via the moomoo-api npm package using the WebSocket protocol (InitWebSocket), I receive:

```
InitWebSocket Response:
- retType: -1 (permission denied)
- retMsg: (empty)
- s2c: null
```

### FreqLimitMooMoo.json Status

The file at `~/.com.moomoo.OpenD/F3CNN/FreqLimitMooMoo.json` contains:

```json
{
   "opend_freq_limit" : {
      "trd_modify_order" : { "num" : 100, "second" : 30 },
      "trd_place_order" : { "num" : 100, "second" : 30 }
   },
   "user_id" : [ 9060041, 70011609, 70823533, 101132133 ]
}
```

**Account 72635647 is NOT in the user_id whitelist array.**

This file auto-regenerates on each gateway startup and cannot be manually edited (changes are reverted), indicating it's managed by your backend systems.

### Gateway Logs Confirm Account Login

From `GTWLog_0_2025_10_15_07_44_03.log`:
```
Login Account: 72635647
Login successful
```

Regular API connections work fine, but WebSocket InitWebSocket protocol is rejected.

---

## Questionnaire Completion

- **Status:** Completed earlier today (October 14, 2025)
- **Time Since Completion:** Over 2 hours ago
- **Confirmation:** Yes, completed the questionnaire and agreements
- **Expected Behavior:** Account should be automatically added to API whitelist within 2 hours

---

## Request

Please investigate why account **72635647** has not been added to the API whitelist (FreqLimitMooMoo.json) despite completing the API Questionnaire over 2 hours ago, and:

1. **Add account 72635647 to the API whitelist** to enable WebSocket access
2. **Advise if there are additional approval steps** required
3. **Clarify the expected timeline** for API access activation
4. **Confirm if there are additional requirements** (asset thresholds, trading volume, etc.)

---

## Additional Context

I'm developing a trading automation system using your OpenAPI and have successfully implemented all 16 required adapter methods with 100% test coverage. The implementation is code-complete and ready for production testing, but blocked solely by the whitelist activation issue.

All versions are properly aligned (OpenD Gateway 9.4.5408 matches moomoo-api 9.4.5408), and the gateway is functioning normally for regular API access.

---

## Contact Information

- **Account:** 72635647
- **Email:** [Your email address]
- **Preferred Contact Method:** Email

---

## How to Submit This Request

**Email To:** openapi@moomoo.com
**Subject:** API Whitelist Not Activated - Account 72635647

You can copy the contents of this document and send it to the email address above. The openapi@moomoo.com address is the dedicated support channel for OpenAPI technical issues.

**Alternative Support Channels:**
- **General Support:** cs@us.moomoo.com
- **Live Chat:** Available 24/7 in the moomoo app
- **Support Center:** https://www.moomoo.com/us/support

Thank you for your assistance in resolving this issue.
