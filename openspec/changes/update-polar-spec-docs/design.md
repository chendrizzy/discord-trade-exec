# Design: Update OpenSpec Docs for Polar Billing

## Overview
Existing change specs referenced Stripe billing even though the implementation now uses Polar.sh. This design documents the minimal documentation realignment needed to make `implement-dual-dashboard-system` and related change docs match the Polar infrastructure.

## Goals
- Replace active references to Stripe customer portals, checkout flows, and services with the Polar billing provider terminology.
- Keep historical mentions of Stripe only in archived or context-setting sections.
- Ensure spec requirements and tasks point to the billing provider abstraction (`BillingProviderFactory`, `polar.js`) instead of the removed `stripe.js` service.

## Non-Goals
- No changes to runtime code; this work is documentation-only.
- No expansion of Polar functionality beyond what already exists.
- Historical sections that intentionally discuss Stripe migrations remain untouched when clearly marked as legacy context.

## Key Updates
1. **Task Lists** – `implement-dual-dashboard-system/tasks.md` now tracks Polar portal integration and Polar validation TODOs, replacing Stripe placeholders.
2. **Dashboard Specs** – Community, trader, and shared component specs refer to Polar billing portals and checkout links.
3. **Billing Change Proposal** – `migrate-to-polar-billing/proposal.md` success criteria now note the Stripe dependency removal as completed.
4. **Status Reports** – Deployment and roadmap docs that previously scheduled "Stripe migration" now mention Polar validation/monitoring.

## Risks
- Minimal: documentation drift could reappear if future billing work reintroduces Stripe references; run `rg "Stripe" openspec/changes` periodically.

## Validation
- `openspec validate update-polar-spec-docs --strict` ensures the change contains spec deltas and stays consistent with OpenSpec conventions.
- Manual review ensured remaining "Stripe" references are confined to archived guidance or comparison context.
