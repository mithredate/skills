# What belongs in a CLAUDE.md

## The WHAT-WHY-HOW framework

1. **WHAT**: tech stack, project structure, codebase map (critical for monorepos)
2. **WHY**: purpose of project components and their relationships
3. **HOW**: workflows, verification methods, testing procedures

## Include

```markdown
# Code style (brief!)
- Use ES modules (import/export), not CommonJS
- Destructure imports when possible

# Workflow
- Typecheck after code changes
- Run single tests, not full suite

# Project structure
src/
├── components/   # React components
├── lib/          # Shared utilities
└── api/          # API routes
```

## Leave out

1. **Task-specific instructions**: content not relevant to the current task is ignored
2. **Linting rules**: use actual linters; LLMs are slow and expensive for this
3. **Code snippets**: they go stale; use `file:line` references instead
4. **Auto-generated content**: craft this file; do not rely on `/init`
5. **Build/test/typecheck commands** the manifest already states (`package.json`): cheap one-file lookup, and they go stale. Keep only the how the manifest cannot say (runs inside a container, needs a fixture first).

## Progressive disclosure

For complex projects, keep task-specific docs in separate files and point at them:

```text
agent_docs/
├── building_the_project.md
├── running_tests.md
└── database_schema.md
```

```markdown
## Testing
See agent_docs/running_tests.md for testing guide.
```

## Placement

- **Root**: shared context for all work
- **Subdirectories**: pulled in when working in that directory (`frontend/CLAUDE.md`)
- **Home folder** (`~/.claude/CLAUDE.md`): personal preferences across all projects
