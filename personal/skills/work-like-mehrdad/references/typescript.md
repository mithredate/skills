# TypeScript rubric

This rubric states conventions for TypeScript code. Use it when you write TypeScript or review a diff that touches it.

## Types carry the logic

- **Union types over `string`**. This also applies to enums. Anything the type system can enforce moves into the types. Invalid states must not compile.
- **One source of truth** for a constant set and its type. Define the const object, then derive the union from it, for example with `as const satisfies Record<string, T>` or `keyof typeof`. Never keep a hand-maintained parallel type next to the const object.
- No `any` without a stated reason at the usage site.

## Constants and naming

- **No magic literals.** Extract a string or numeric literal with meaning to a named constant. Replace *every* usage, not just the new one.
- Use precise, domain-correct names. Rename a name that misstates what the thing is. For example, rename `variables` used for a config map, or `actor` used for a user id.

## Structure

- **Writes are actions, queries are reads**. Name and organize them that way, in a CQRS style. Keep the split consistent across layers. This includes file names and branch names.
- **No generic `update` operations.** Give a domain operation a specific, intention-revealing action, such as `approve`, `decline`, or `reopen`. Extract shared mechanics into a composable or a helper that the specific actions use.
- Business logic does not live in a handler or a controller. State rules, such as allowed transitions and invariants, belong to the domain layer. The caller must not pass them in.
- **Check existing utils before writing new code.** Grep `utils/`, sibling components, and shared modules first. Extract copy-pasted logic to a shared home, and do not add a third copy.
- A type used by more than one module moves to the shared types location, such as `shared/` or `app/types/`. Do not duplicate a type definition. Do not define a type inside a component.

## API evolution

- Never break an API silently. Deprecate it explicitly. Rename it with a `deprecated` prefix so its usage is visible. Build the new version in parallel. Migrate clients before you delete the old version.
