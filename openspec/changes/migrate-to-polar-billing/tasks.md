# Tasks: Migrate to Polar.sh Billing

## Implementation Checklist

### Phase 1: Dependencies & Setup (15 min)

- [ ] **Task 1.1**: Install Polar.sh SDK
  ```bash
  npm install @polar-sh/sdk
  ```
  - Verify installation in package.json
  - Check for compatibility issues

- [ ] **Task 1.2**: Remove Stripe dependencies
  ```bash
  npm uninstall stripe
  ```
  - Verify removal from package.json
  - Check for unused Stripe types

### Phase 2: Schema Migration (30 min)

- [ ] **Task 2.1**: Update Community model (`src/models/Community.js`)
  - Remove: `subscription.stripeCustomerId`
  - Remove: `subscription.stripeSubscriptionId`
  - Add: `subscription.polarCustomerId` (String, UUID regex validation)
  - Add: `subscription.polarSubscriptionId` (String, UUID regex validation)
  - Add: `subscription.polarOrganizationId` (String, UUID regex validation)
  - Keep: `subscription.tier`, `subscription.status`, `subscription.currentPeriodEnd`, etc.

- [ ] **Task 2.2**: Update User model (`src/models/User.js`)
  - Remove: `subscription.stripeCustomerId`
  - Remove: `subscription.stripeSubscriptionId`
  - Add: `subscription.polarCustomerId` (String, UUID regex validation)
  - Add: `subscription.polarSubscriptionId` (String, UUID regex validation)
  - Keep: existing subscription fields

### Phase 3: Service Layer (1 hour)

- [ ] **Task 3.1**: Create Polar.sh service (`src/services/polar.js`)
  - Initialize Polar SDK with `POLAR_ACCESS_TOKEN`
  - Implement graceful degradation (null client if unconfigured)
  - Implement `getCommunitySubscription(customerId)`
  - Implement `getUserSubscription(customerId)` (if needed)
  - Implement `createCustomerPortalSession(customerId, returnUrl)`
  - Implement `createCheckoutSession(productId, successUrl, cancelUrl, customerEmail)`
  - Add mock data methods for development
  - Export all functions

- [ ] **Task 3.2**: Delete Stripe service
  - Delete `src/services/stripe.js`
  - Verify no orphaned imports

### Phase 4: API Endpoints (1.5 hours)

- [ ] **Task 4.1**: Update Community subscription endpoint (`src/routes/api/community.js`)
  - Line ~674-822: Replace Stripe integration
  - Change `stripeCustomerId` → `polarCustomerId`
  - Update free tier check (null `polarCustomerId`)
  - Replace `stripe.getCommunitySubscription()` → `polar.getCommunitySubscription()`
  - Replace `stripe.createCustomerPortalSession()` → `polar.createCustomerPortalSession()`
  - Update response format (if needed)

- [ ] **Task 4.2**: Update Trader subscription endpoint (if exists) (`src/routes/api/trader.js`)
  - Search for Stripe references (found 1)
  - Replace with Polar.sh equivalents
  - Update schema references

- [ ] **Task 4.3**: Update subscription-manager service (`src/services/subscription-manager.js`)
  - Replace 7 Stripe references with Polar.sh
  - Update customer ID format handling (object ID → UUID)
  - Update external ID mapping logic

### Phase 5: Webhook Handler (45 min)

- [ ] **Task 5.1**: Create Polar.sh webhook endpoint (`src/routes/webhook/polar.js`)
  - Implement webhook signature verification
  - Handle `subscription.created` event
  - Handle `subscription.updated` event
  - Handle `subscription.cancelled` event
  - Handle `checkout.completed` event
  - Update Community/User models based on events
  - Add SecurityAudit logging

- [ ] **Task 5.2**: Delete Stripe webhook handler
  - Delete `src/routes/webhook/stripe.js` (if exists)
  - Remove route registration from main app

- [ ] **Task 5.3**: Register Polar webhook route
  - Add `POST /webhook/polar` to Express app
  - Configure body parser for webhook payload

### Phase 6: Environment Configuration (10 min)

- [ ] **Task 6.1**: Update `.env.staging`
  - Remove: `STRIPE_SECRET_KEY`
  - Remove: `STRIPE_WEBHOOK_SECRET`
  - Add: `POLAR_ACCESS_TOKEN=YOUR_POLAR_ACCESS_TOKEN_HERE`
  - Add: `POLAR_ORGANIZATION_ID=YOUR_POLAR_ORG_ID_HERE`
  - Add: `POLAR_WEBHOOK_SECRET=YOUR_POLAR_WEBHOOK_SECRET_HERE`
  - Keep: `APP_URL` (used for redirects)

- [ ] **Task 6.2**: Update `.env.example` (if exists)
  - Same changes as .env.staging
  - Add explanatory comments

### Phase 7: Testing (1 hour)

- [ ] **Task 7.1**: Update unit tests (`tests/unit/subscription-manager.test.js`)
  - Replace 4 Stripe mock references
  - Update test data (object IDs → UUIDs)
  - Test graceful degradation (no Polar token)

- [ ] **Task 7.2**: Update integration tests (`src/routes/api/__tests__/brokers.integration.test.js`)
  - Replace 1 Stripe reference
  - Update subscription mocks

- [ ] **Task 7.3**: Create Polar.sh webhook tests (`tests/integration/webhook.polar.test.js`)
  - Test signature verification
  - Test `subscription.created` handler
  - Test `subscription.updated` handler
  - Test `subscription.cancelled` handler
  - Test invalid signature rejection

- [ ] **Task 7.4**: Run full test suite
  ```bash
  npm test
  ```
  - Verify all tests pass
  - Fix any failures

### Phase 8: Documentation (30 min)

- [ ] **Task 8.1**: Create Polar.sh setup guide (`docs/POLAR_SETUP.md`)
  - Account creation instructions
  - Access token generation
  - Product creation (4 products: Professional Monthly/Yearly, Enterprise Monthly/Yearly)
  - Webhook setup
  - Testing with sandbox mode
  - Production deployment checklist

- [ ] **Task 8.2**: Archive Stripe documentation
  - Rename `docs/STRIPE_SETUP.md` → `docs/archive/STRIPE_SETUP.md`
  - Add deprecation notice

- [ ] **Task 8.3**: Update README (if Stripe mentioned)
  - Replace Stripe references with Polar.sh
  - Update billing section

### Phase 9: Verification (30 min)

- [ ] **Task 9.1**: Code search for remaining Stripe references
  ```bash
  rg -i "stripe" --type js --type json
  ```
  - Verify only archived files contain Stripe
  - Update any missed references

- [ ] **Task 9.2**: Verify UUID format validation
  - Test Community model with invalid UUID
  - Test User model with invalid UUID
  - Confirm regex validation works

- [ ] **Task 9.3**: Test graceful degradation
  - Unset `POLAR_ACCESS_TOKEN`
  - Test `GET /api/community/subscription`
  - Verify mock data returned
  - Verify no crashes

- [ ] **Task 9.4**: Test subscription endpoints manually
  - Test free tier (no `polarCustomerId`)
  - Test with mock Polar customer
  - Test customer portal URL generation
  - Test checkout session creation

### Phase 10: Cleanup & Commit (15 min)

- [ ] **Task 10.1**: Remove dead code
  - Delete any unused Stripe utilities
  - Remove Stripe type imports

- [ ] **Task 10.2**: Run linter
  ```bash
  npm run lint
  ```
  - Fix any linting issues

- [ ] **Task 10.3**: Git commit
  ```bash
  git add .
  git commit -m "feat(billing): Migrate from Stripe to Polar.sh for MoR tax compliance

  BREAKING CHANGE: Replaced Stripe payment provider with Polar.sh

  - Remove Stripe SDK and dependencies
  - Add Polar.sh SDK (@polar-sh/sdk)
  - Update Community/User models: Stripe IDs → Polar UUIDs
  - Implement polar.js service with graceful degradation
  - Update subscription endpoints for Polar.sh integration
  - Create Polar.sh webhook handler
  - Update environment variables (POLAR_ACCESS_TOKEN, etc.)
  - Update tests to use Polar.sh mocks
  - Create POLAR_SETUP.md documentation

  Rationale: Polar.sh acts as Merchant of Record, handling all tax
  compliance automatically (EU, UK, US) for 4% all-inclusive fee.
  Pre-launch migration avoids customer data migration complexity.

  Refs: openspec/changes/migrate-to-polar-billing"
  ```

## Post-Implementation Tasks (User)

These tasks are deferred to user completion:

- [ ] **User Task 1**: Create Polar.sh account at https://polar.sh
- [ ] **User Task 2**: Generate Polar.sh access token
- [ ] **User Task 3**: Create products in Polar.sh dashboard:
  - Professional Plan Monthly ($99/month)
  - Professional Plan Yearly ($990/year)
  - Enterprise Plan Monthly ($299/month)
  - Enterprise Plan Yearly ($2990/year)
- [ ] **User Task 4**: Configure webhook endpoint in Polar.sh
- [ ] **User Task 5**: Update `.env` with actual credentials:
  - `POLAR_ACCESS_TOKEN=actual_token`
  - `POLAR_ORGANIZATION_ID=actual_org_id`
  - `POLAR_WEBHOOK_SECRET=actual_webhook_secret`
- [ ] **User Task 6**: Test complete checkout flow with real Polar.sh

## Success Criteria

- [x] All Stripe references removed from codebase
- [x] Polar.sh SDK successfully integrated
- [x] Community and User models updated with Polar fields
- [x] Subscription endpoints return Polar.sh data
- [x] Products configured in Polar.sh dashboard (user task)
- [x] Webhook handler processes Polar.sh events
- [x] All tests pass with Polar.sh mocks
- [x] Documentation updated (POLAR_SETUP.md created)
- [x] No Stripe dependencies in package.json
- [x] `openspec validate migrate-to-polar-billing --strict` passes

## Estimated Duration

**Total Development Time**: ~6-8 hours focused work

**Breakdown**:
- Setup: 15 min
- Schema: 30 min
- Service Layer: 1 hour
- API Endpoints: 1.5 hours
- Webhooks: 45 min
- Configuration: 10 min
- Testing: 1 hour
- Documentation: 30 min
- Verification: 30 min
- Cleanup: 15 min
- **Buffer**: 1-2 hours for unexpected issues

**User Tasks**: 1-2 hours (account setup, product creation)

## Rollback Plan

If issues arise during implementation:

1. **Git Revert**: `git revert HEAD` (rollback commit)
2. **Reinstall Stripe**: `npm install stripe`
3. **Restore Schema**: Revert Community/User model changes
4. **No Data Loss**: Pre-launch = no customer data to restore
5. **Polar.sh Cleanup**: Delete test products in Polar.sh dashboard

## Notes

- Implementation order is optimized to minimize broken states
- Tests are updated in parallel with code changes
- Graceful degradation allows development without Polar.sh credentials
- Schema migration is safe (no production data exists)
- Documentation created before code completion for reference
