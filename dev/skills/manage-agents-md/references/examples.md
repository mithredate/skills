# CLAUDE.md Examples and Templates

## Table of Contents
- [Minimal Template (~30 lines)](#minimal-template)
- [Standard Template (~60 lines)](#standard-template)
- [Monorepo Template](#monorepo-template)
- [Progressive Disclosure Example](#progressive-disclosure-example)

---

## Minimal Template

For small projects or when starting fresh:

```markdown
# Project Name

## Structure
src/
├── index.ts      # Entry point
├── lib/          # Core utilities
└── types/        # TypeScript types

## Workflow
- Run typecheck after code changes
- Write tests for new features
```

---

## Standard Template

For typical projects (~60 lines):

```markdown
# Project Name

Brief description of what this project does.

## Project Structure
src/
├── components/     # React components
│   ├── ui/         # Reusable UI primitives
│   └── features/   # Feature-specific components
├── lib/            # Shared utilities and helpers
├── hooks/          # Custom React hooks
├── api/            # API routes and handlers
└── types/          # TypeScript type definitions

## Code Style
- Use ES modules (import/export), not CommonJS
- Prefer named exports over default exports
- Destructure imports when possible

## Testing
- Run single test files during development: `npm run test -- path/to/test`
- See docs/testing.md for testing patterns

## Workflow
1. Create feature branch from main
2. Make changes with tests
3. Run typecheck and tests before committing
4. Open PR with description of changes
```

---

## Monorepo Template

Root CLAUDE.md for monorepos:

```markdown
# Monorepo Name

## Structure
apps/
├── web/           # Next.js web application
├── mobile/        # React Native app
└── api/           # Express API server

packages/
├── ui/            # Shared component library
├── config/        # Shared configs (ESLint, TypeScript)
└── utils/         # Shared utilities

## Working on Specific Apps
Each app has its own CLAUDE.md with specific instructions:
- apps/web/CLAUDE.md - Web app specifics
- apps/api/CLAUDE.md - API specifics

## Shared Packages
When modifying shared packages, test affected apps:
- Changes to packages/ui → test apps/web and apps/mobile
- Changes to packages/utils → run full test suite
```

---

## Progressive Disclosure Example

When you need detailed docs but want to keep CLAUDE.md lean:

**CLAUDE.md (kept brief):**
```markdown
# Project Name

## Structure
See docs/architecture.md for detailed architecture.

## Key Documentation
- Testing: docs/testing.md
- Database: docs/database-schema.md
- API: docs/api-reference.md
- Deployment: docs/deployment.md

## Quick Reference
- Entry point: src/main.py:1
- Config loading: src/config.py:15
- Database models: src/models/
```

**docs/testing.md (loaded when needed):**
```markdown
# Testing Guide

## Running Tests
- Single file: `pytest tests/test_file.py`
- With coverage: `pytest --cov=src`
- Specific test: `pytest tests/test_file.py::test_name`

## Test Structure
tests/
├── unit/           # Unit tests
├── integration/    # Integration tests
└── fixtures/       # Shared test fixtures

## Writing Tests
- Use fixtures from conftest.py
- Mock external services
- Test edge cases
```

---

## Anti-Patterns to Avoid

**Too verbose (bad):**
```markdown
## Code Style Guidelines
When writing JavaScript code in this project, you should always use ES modules
syntax (import/export) instead of CommonJS (require). This is because ES modules
are the modern standard and provide better tree-shaking...
[continues for 50 more lines]
```

**Concise (good):**
```markdown
## Code Style
- Use ES modules (import/export), not CommonJS
- Destructure imports when possible
```

**Task-specific (bad):**
```markdown
## Creating New API Endpoints
When creating a new API endpoint, first create the route file in src/routes/,
then add the handler in src/handlers/, then update the router in src/index.ts...
```

**Universal (good):**
```markdown
## API Structure
- Routes: src/routes/
- Handlers: src/handlers/
- See docs/api-patterns.md for conventions
```
