# Proposal: Update OpenSpec Docs for Polar Billing

## Why
- Existing change documents (e.g., `implement-dual-dashboard-system`) still reference Stripe integration even though the platform now uses Polar.sh as the billing provider.
- Inconsistent terminology creates confusion for implementers and reviewers, and blocks completion of the Polar billing migration checklist.

## What Changes
- Replace Stripe-specific language within affected OpenSpec change docs (tasks, specs, deployment notes) with Polar.sh terminology.
- Add cross-references to the Polar billing service (`polar.js`) and remove obsolete mentions of `src/services/stripe.js`.
- Ensure overarching status docs (e.g., completion or deployment notes) accurately describe Polar as the active provider.

## Impact
- Affected change specs: `implement-dual-dashboard-system`, `migrate-to-polar-billing`, plus shared status docs referencing Stripe.
- No code changes required; documentation alignment only.
