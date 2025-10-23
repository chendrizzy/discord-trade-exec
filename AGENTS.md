---
title: Repository Guidelines
---

# Repository Guidelines

Welcome to **discord‑trade‑executor‑saas**. This quick guide covers the
project layout, tooling, and best practices.
*Note: AGENTS.md, CLAUDE.md and WARP.md are to remain in the root directory, and all three LLM docs (CLAUDE.md, WARP.md, and AGENTS.md) are to be kept in sync.*

## Project Structure & Module Organization

```
 ├─ src/           # API & Discord bot logic
 │  ├─ routes/    # Express handlers
 │  ├─ models/    # Mongoose schemas
 │  └─ utils/     # Helpers
 ├─ src/dashboard/ # React SPA (Vite)
 ├─ tests/        # Jest + Playwright tests
 ├─ docs/         # Deployment & diagrams
 └─ package.json
```

The backend lives in `src`, the dashboard is `src/dashboard`, and tests
mirror the source tree under `tests/[unit|integration|e2e]`.

## Build, Test, and Development

```bash
npm start             # Run bot & API
npm run dev           # Nodemon watcher
npm run dev:dashboard # Vite dev server for UI
npm run build         # Webpack bundle (API)
npm run build:dashboard
npm run preview:dashboard
npm test              # Jest unit & integration
npm run deploy         # Railway deploy
```

For hot‑reload on both layers:

```bash
npm run dev & npm run dev:dashboard
```

<!-- OPENSPEC:START -->
## OpenSpec Instructions

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

## Coding Style & Naming

- 2‑space indentation, `use strict`.
- Variables `camelCase`, constants `UPPER_CASE`.
- React components export as `export default function Comp(...)`.
- Lint with ESLint: `npx eslint src/ --fix`.

## Testing

- Jest unit & integration (`npm test`).
- Playwright e2e in `tests/e2e` (`npx playwright test`).
- Aim for >80 % coverage; run with `--coverage`.

## Commit & PR Guidelines

- Conventional Commits (e.g., `feat: add risk module`).
- Reference an issue (e.g., `Closes #123`).
- Include a brief description and screenshots if UI changes.
- Limit PRs to one feature/bug.

## Security & Config

- Secrets in a `.env` file – never commit.
- `dotenv` loads env vars.
- Run `npm audit` regularly.
- Use `helmet`, `rate‑limiter‑flexible` to harden the API.

## Documentation Standards

### Core Documentation Files

- **README.md**: Keep up-to-date with project overview, setup, and usage
- **CHANGELOG.md**: Maintain following Keep a Changelog conventions
- **project.md**: Track project changes with versioning and dates

### API Documentation

- Generate API docs with JSDoc comments
- Document endpoints with Swagger or Postman collections
- Use `typedoc` for TypeScript documentation

### Directory Structure

```
docs/
├── diagrams/          # Visual aids (flowcharts, architecture)
├── guides/            # Process and workflow guidelines
├── plans/             # Planning documents
├── reports/
│   ├── summaries/     # Feature/change summaries
│   ├── analysis/      # Technical analysis
│   └── status/        # Project status reports
└── deployment/        # Deployment processes and notes
```

### Diagrams & Visual Aids

**When to Create:**

- Complex processes or workflows
- System architecture changes
- Component relationships

**Requirements:**

- Store in `docs/diagrams/` with clear versioning and dates
- Include clear titles and focus on key concepts
- Illustrate relationships and workflows clearly
- Use consistent formatting and style
- Involve stakeholders for alignment

### Reports (Summaries, Analysis, Status)

**Structure Requirements:**

- Well-organized with clear titles and dates
- Include screenshots, code samples, and key findings
- Concise and focused on actionable insights
- Highlight areas needing attention or follow-up
- Link related documentation for context
- Define KPIs and success criteria
- Set clear timelines and milestones
- Ensure adaptability to changing requirements

**Organization:**

- General reports: `docs/reports/`
- Summaries: `docs/reports/summaries/`
- Analysis: `docs/reports/analysis/`
- Status: `docs/reports/status/`

### Plans & Guides

**Storage:**

- Plans: `docs/plans/`
- Guides: `docs/guides/`

**Requirements:**

- Organized by categories, subcategories, features, and scopes
- Include code samples and key findings
- Clear timelines and milestones
- KPIs and success criteria defined
- Stakeholder involvement for alignment
- Use collaborative tools for creation and review

### Documentation Quality Standards

**ALWAYS:**

- Keep clear, concise, and up-to-date
- Ensure easy navigation and organization
- Follow best practices for technical writing
- Use visual aids where applicable
- Break complex information into manageable sections
- Use consistent terminology (maintain glossary if needed)
- Ensure proper version control
- Solicit and incorporate feedback continuously
- Prioritize clarity and usability
- Focus on the intended audience's needs
- Align with project goals and objectives
- Regularly review and update to reflect code changes

**NEVER:**

- Leave documentation outdated or incomplete
- Clutter repository with redundant documents
- Neglect documentation quality or clarity
- Neglect any part of the project
- Repeat yourself unnecessarily

### Stakeholder Engagement

- Involve stakeholders in documentation creation
- Use collaborative tools for facilitation
- Set clear review timelines
- Define documentation effectiveness criteria
- Ensure stakeholders can easily understand and navigate

## Deployment

- Deploy to Railway using `npm run deploy`.
- Monitor deployment with `railway logs --tail`.
- Update `docs/deployment/README.md` with deployment notes.
- Ensure deployment is successful and aligned with project requirements.
- Document deployment processes and configurations clearly.
- Ensure deployment documentation is up-to-date and accurate.
- Ensure deployment documentation is stored properly in `docs/deployment/`.
- Ensure deployment processes are well-organized and easy to follow.

---
