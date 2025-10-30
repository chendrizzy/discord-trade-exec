<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Documentation Storage Guidelines

Per AGENTS.md, ALL documentation, reports, summaries, and analysis files MUST be stored in the `docs/` directory structure:

```
docs/
├── diagrams/          # Visual aids (flowcharts, architecture)
├── guides/            # Process and workflow guidelines
├── plans/             # Planning documents
├── reports/
│   ├── summaries/     # Feature/change summaries
│   ├── analysis/      # Technical analysis (e.g., coverage reports)
│   └── status/        # Project status reports
└── deployment/        # Deployment processes and notes
```

**NEVER put documentation/reports in:**
- ❌ Root directory
- ❌ `documentation/` directory
- ❌ `openspec/` directory (reserved for specs)

**ALWAYS put documentation in:**
- ✅ `docs/reports/analysis/` for coverage reports, technical analysis
- ✅ `docs/reports/summaries/` for feature/change summaries
- ✅ `docs/reports/status/` for project status reports
- ✅ `docs/diagrams/` for visual aids
- ✅ `docs/guides/` for process guides
- ✅ `docs/plans/` for planning documents