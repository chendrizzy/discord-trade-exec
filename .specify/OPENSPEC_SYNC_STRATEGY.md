# OpenSpec ↔ Speckit Sync Strategy

**Version**: 1.0.0
**Last Updated**: 2025-10-21
**Status**: Active

## Philosophy

**Single Source of Truth**: OpenSpec (`openspec/changes/`) remains the authoritative source for:
- Implementation tasks
- Technical decisions
- Design documentation
- Task-level completion tracking

**Speckit Purpose**: Speckit (`specs/`) serves as:
- Product requirements layer
- User story definitions
- Acceptance criteria
- Business-level tracking
- Constitution compliance gateway

## Sync Mechanism

### Directory Mapping

```
OpenSpec (Source of Truth)          Speckit (Consolidated View)
=================================   ===============================
openspec/changes/[change-id]/       specs/[###-feature]/
├── proposal.md                     ├── spec.md (user stories)
├── tasks.md (detailed)       →     ├── plan.md (architecture)
├── design.md                 →     └── tasks.md (consolidated)
└── specs/[capability]/
    └── spec.md (deltas)
```

### Sync Rules

**1. OpenSpec → Speckit (One-Way Sync)**

When OpenSpec proposal updated:
- **Completion %**: Recalculate from tasks.md checkboxes → Update Speckit spec.md status
- **Technical decisions**: design.md → Speckit plan.md architecture section
- **Requirements**: OpenSpec deltas → Speckit spec.md requirements (if product-level)
- **Timeline**: proposal.md dates → Speckit plan.md phases

**2. Completion Calculation Formula**

```
Task Completion = (Checked Tasks / Total Tasks) × 100%

Quality Gate Multipliers:
- Code only = 60% max
- Code + Tests = 80% max  
- Code + Tests + Docs = 90% max
- Code + Tests + Docs + Deployed = 100%

Scaffolded Work = 25% (UI without data integration)
```

**3. Status Taxonomy (Standardized)**

| Status            | Criteria                                        | Icon | Speckit Display     |
| ----------------- | ----------------------------------------------- | ---- | ------------------- |
| **Complete**      | 100%: Code + Tests + Docs + Deployed            | ✅    | ✅ IMPLEMENTED       |
| **Staging Ready** | 90-99%: Code + Tests + Docs, deployment pending | 🟢    | 🟢 STAGING READY     |
| **In Progress**   | 10-89%: Active development                      | ⏳    | ⏳ IN PROGRESS (XX%) |
| **Scaffolded**    | 1-25%: UI/structure only, no logic              | 📦    | 📦 SCAFFOLDED (XX%)  |
| **Proposed**      | 0%: Not started                                 | 🔮    | 🔮 PROPOSED          |
| **Blocked**       | Dependency/resource issue                       | 🚫    | 🚫 BLOCKED           |

**4. Sync Cadence**

- **Real-time**: Constitution violations detected → Flag immediately
- **Daily**: Completion % sync from OpenSpec tasks.md
- **Weekly**: Requirements alignment check (OpenSpec deltas ↔ Speckit FRs)
- **Per-deployment**: Full audit and status update

## Workflow Integration

### Creating New Work

**Option A: Start in OpenSpec (Recommended for implementation)**
1. Create OpenSpec proposal (`openspec/changes/[change-id]/`)
2. Write technical `tasks.md`, `design.md`
3. Auto-generate Speckit spec.md from OpenSpec metadata
4. Validate against constitution
5. Implement per OpenSpec tasks

**Option B: Start in Speckit (Recommended for product features)**
1. Create Speckit spec (`/speckit.specify`)
2. Generate plan (`/speckit.plan`)
3. Auto-create OpenSpec proposal from Speckit
4. Implement per Speckit tasks
5. Sync completion back to Speckit

### Validation Gates

**Pre-Implementation (Both Systems)**
- [ ] Constitution compliance check passed
- [ ] Requirements have acceptance scenarios
- [ ] Test-first tasks identified for critical paths
- [ ] Security requirements explicit

**Pre-Deployment (OpenSpec)**
- [ ] All tasks checked in tasks.md
- [ ] Tests passing (>80% coverage globally, >95% critical)
- [ ] Documentation updated
- [ ] Security audit completed (if security-relevant)

**Post-Deployment (Sync to Speckit)**
- [ ] Update Speckit status to ✅ IMPLEMENTED
- [ ] Archive OpenSpec proposal to `changes/archive/`
- [ ] Update project.md with new capabilities

## Constitution Compliance Auditing

### Audit Process

**For Existing Work (Pre-Constitution)**:
1. Review proposal against 7 core principles
2. Document exceptions with rationale
3. Create remediation plan for critical violations
4. Add constitution compliance section to proposal.md

**For New Work (Post-Constitution)**:
1. Constitution check REQUIRED in plan.md before Phase 0
2. Test-first tasks MANDATORY for critical paths (Principle II)
3. Security review MANDATORY for auth/billing/broker code (Principle I)
4. Adapter pattern validation for broker integrations (Principle III)

### Compliance Scoring

```
Score = (Principles Met / 7) × 100

90-100% = ✅ Compliant
70-89%  = ⚠️ Needs Review
<70%    = ❌ Non-Compliant (blocks deployment)
```

**Critical Principles** (NON-NEGOTIABLE):
- Principle I: Security-First Development
- Principle II: Test-First for Critical Paths

Violations of critical principles = Automatic ❌ Non-Compliant

## Tools & Automation

### Planned Tooling

1. **Sync Script**: `scripts/sync-openspec-to-speckit.js`
   - Reads OpenSpec tasks.md completion
   - Updates Speckit spec.md status table
   - Flags constitution violations

2. **Constitution Audit**: `scripts/audit-constitution-compliance.js`
   - Scans proposals for principle adherence
   - Generates compliance report
   - Suggests remediation actions

3. **Completion Calculator**: `scripts/calculate-completion.js`
   - Applies quality gate multipliers
   - Distinguishes scaffolded vs implemented
   - Outputs standardized percentages

### Manual Sync Checklist

Until automation available:

**After OpenSpec task completion:**
- [ ] Run `grep -c '^\- \[x\]' openspec/changes/[id]/tasks.md` (checked count)
- [ ] Run `grep -c '^\- \[' openspec/changes/[id]/tasks.md` (total count)
- [ ] Calculate: `(checked / total) × gate_multiplier`
- [ ] Update Speckit spec.md status table with new %
- [ ] Update status icon if threshold crossed

**Before deployment:**
- [ ] Verify tests exist for critical paths
- [ ] Confirm documentation updated
- [ ] Run security audit if applicable
- [ ] Update status to 🟢 STAGING READY

**After deployment:**
- [ ] Update status to ✅ IMPLEMENTED
- [ ] Move OpenSpec to `changes/archive/YYYY-MM-DD-[id]/`
- [ ] Update `openspec/specs/` if new capability

## Example: Broker Integration Sync

**OpenSpec State**:
```
openspec/changes/implement-broker-integrations/tasks.md
- 62/70 tasks checked
- Tests passing (74 unit tests)
- Docs complete (BROKER-SETUP.md)
- Deployment pending
```

**Calculation**:
```
Base completion: 62/70 = 88.6%
Quality gates: Code ✅ + Tests ✅ + Docs ✅ = 90% max (deployment pending)
Final: min(88.6%, 90%) = 88.6%
Status: 🟢 STAGING READY
```

**Speckit Update**:
```markdown
| implement-broker-integrations | 🟢 Staging Ready | 88.6% (62/70) | US-2 | IBKR, Schwab, Alpaca, Coinbase, Kraken complete; deployment pending |
```

## Rollout Plan

### Phase 1: Manual Sync (Week 1)
- Audit all OpenSpec proposals for current status
- Recalculate completion with quality gates
- Update Speckit spec.md manually
- Document exceptions and compliance issues

### Phase 2: Semi-Automated (Week 2-3)
- Create sync scripts (completion calculator, status updater)
- Run weekly syncs with script assistance
- Validate accuracy against manual baseline

### Phase 3: Automated (Week 4+)
- Git hooks trigger sync on OpenSpec task.md changes
- CI/CD checks constitution compliance
- Dashboard displays unified view (OpenSpec + Speckit)

---

**Maintainer**: Update this document when sync process changes
**Next Review**: 2025-11-21 (monthly cadence)
