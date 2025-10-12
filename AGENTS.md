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

---
title: Repository Guidelines
---

# Repository Guidelines

Welcome to **discord‑trade‑executor‑saas**. This quick guide covers the
project layout, tooling, and best practices.

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
npm run deploy         # Build + Vercel deploy
```

For hot‑reload on both layers:

```bash
npm run dev & npm run dev:dashboard
```

## Coding Style & Naming

* 2‑space indentation, `use strict`.
* Variables `camelCase`, constants `UPPER_CASE`.
* React components export as `export default function Comp(...)`.
* Lint with ESLint: `npx eslint src/ --fix`.

## Testing

* Jest unit & integration (`npm test`).
* Playwright e2e in `tests/e2e` (`npx playwright test`).
* Aim for >80 % coverage; run with `--coverage`.

## Commit & PR Guidelines

* Conventional Commits (e.g., `feat: add risk module`).
* Reference an issue (e.g., `Closes #123`).
* Include a brief description and screenshots if UI changes.
* Limit PRs to one feature/bug.

## Security & Config

* Secrets in a `.env` file – never commit.
* `dotenv` loads env vars.
* Run `npm audit` regularly.
* Use `helmet`, `rate‑limiter‑flexible` to harden the API.

---

