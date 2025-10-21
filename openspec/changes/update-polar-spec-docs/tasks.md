# Tasks: Update Polar Terminology in OpenSpec Changes

## 1. Audit & Identification
- [x] 1.1 Run `rg -n "Stripe" openspec/changes` to inventory impacted docs.
- [x] 1.2 Confirm which references should remain historical (e.g., archived change logs) vs. those requiring live updates.

## 2. Update implement-dual-dashboard-system Docs
- [x] 2.1 Replace Stripe references in `openspec/changes/implement-dual-dashboard-system/tasks.md` with Polar equivalents.
- [x] 2.2 Update `openspec/changes/implement-dual-dashboard-system/specs/community-dashboard/spec.md` to mention Polar billing portal.
- [x] 2.3 Update `openspec/changes/implement-dual-dashboard-system/specs/trader-dashboard/spec.md` accordingly.
- [x] 2.4 Update shared component docs (e.g., `specs/shared-components/spec.md`, deployment/status files) to reflect Polar.

## 3. Align Other Change Docs
- [x] 3.1 Amend `openspec/changes/migrate-to-polar-billing` success criteria and status notes to mark Stripe removal as complete.
- [x] 3.2 Refresh consolidated status docs (`COMPLETION_STATUS_REPORT.md`, `DEPLOYMENT_STATUS.md`, etc.) where Stripe is still listed as active provider.

## 4. Validation & Cleanup
- [x] 4.1 Re-run `rg "Stripe"` to ensure remaining references are intentional (historical/contextual) and document exceptions.
- [x] 4.2 Review updated docs for consistency (Polar terminology, file references, feature names).
- [ ] 4.3 `openspec validate update-polar-spec-docs --strict`.
