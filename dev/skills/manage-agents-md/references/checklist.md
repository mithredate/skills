# CLAUDE.md Review Checklist

Use this checklist to validate a CLAUDE.md file.

## Quick Validation

| Check | Pass |
|-------|------|
| Under 300 lines (ideally ~60) | |
| Contains WHAT (tech stack, structure) | |
| Contains WHY (purpose of components) | |
| Contains HOW (workflows) | |
| Has directory map/structure | |
| No task-specific instructions | |
| No code snippets (uses file:line refs instead) | |
| No linting/formatting rules | |
| No auto-generated boilerplate | |

## Content Audit Questions

1. **Is every instruction universally applicable?**
   - Remove anything that only matters for specific tasks
   - Claude ignores content it deems irrelevant to current task

2. **Does each line pass the no-op test?**
   - For each line, does it change behaviour versus what the agent does by default?
   - Delete lines that don't

3. **Is the project structure clear?**
   - Key directories identified
   - Purpose of each directory explained
   - Entry points noted

4. **Are workflows defined?**
   - What to do before modifying code
   - How to verify changes
   - How to test changes

## Red Flags to Remove

- [ ] "When creating a new X, do Y" (task-specific)
- [ ] Code examples longer than 3-4 lines (will go stale)
- [ ] Style rules that a linter could enforce
- [ ] Instructions repeated in different sections
- [ ] Sections that start with "If you're working on..."
- [ ] Auto-generated content from `/init` that wasn't reviewed

## Progressive Disclosure Check

If CLAUDE.md exceeds 100 lines, consider extracting:

- Testing documentation → `agent_docs/testing.md`
- Architecture details → `agent_docs/architecture.md`
- Database schemas → `agent_docs/database.md`
- API documentation → `agent_docs/api.md`

Keep only brief pointers in CLAUDE.md.
