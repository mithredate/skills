# TypeScript rubric

This rubric states conventions for TypeScript code. Use it when you write TypeScript or review a diff that touches it.

## Types carry the logic

- **Union types over `string`**. This also applies to enums. Anything the type system can enforce moves into the types. Invalid states must not compile.
- **One source of truth** for a constant set and its type. Declare the union type directly, such as `type Status = 'draft' | 'approved'`. Never derive the union from the constant. Match the constant to the type with `as const satisfies Record<string, Status>`, so that a drift error points at the constant.
- No `any` without a stated reason at the usage site.

## Constants and naming

- **No magic literals.** Extract a string or numeric literal with meaning to a named constant. Replace *every* usage, not just the new one.
- Use precise, domain-correct names. In the code that you change, rename a name that misstates what the thing is. For example, rename `variables` used for a config map, or `actor` used for a user id.

## Structure

- **Writes are actions, queries are reads**. Name and organize them that way, in a CQRS style. Keep the split consistent across layers. This includes file names and branch names.
- **No generic `update` operations.** Give a domain operation a specific, intention-revealing action, such as `approve`, `decline`, or `reopen`. Extract shared mechanics into a composable or a helper that the specific actions use.
- Business logic does not live in a handler or a controller. State rules, such as allowed transitions and invariants, belong to the domain layer. The caller must not pass them in.
- **Check existing utils before writing new code.** Grep `utils/`, sibling components, and shared modules first.
- A type used by more than one module moves to the shared types location, such as `shared/` or `app/types/`. Do not duplicate a type definition. Do not define a type inside a component.

## Functions and data

- **Argument order.** Order the parameters from stable to volatile. Put the ambient context first, such as `event` or `db`. Then put the code-time configuration, and last the record that the function acts on. A partial application then stays possible, as in `requirePermissionOrBeOwner(user, permission, request)`.
- **Required parameters.** If a parameter exists because callers need different values, make it required, with no default. A default hides the caller that forgot the argument.
- **Spread the existing value.** For a partial update, write `{ ...existing, ownedField: value }`. Do not rebuild the object property by property. A rebuilt object silently drops a field that the type gets later.
- **Named booleans.** If a condition has three or more operands, or negates another computed boolean, move it to a named boolean. The name states the check, such as `isOutsiderAccessingDraft`. The reader then reads the intent, not the logic.
- **Audit timestamps are not domain data.** Never drive business logic from `created_at` or `updated_at`. Add a column with a domain name, such as `submitted_at`. An audit field changes on every edit. A review round once used `updated_at` as its boundary, and each new review hid the earlier approvals.

## API evolution

- Never break an API silently. Deprecate it explicitly. Rename it with a `deprecated` prefix so its usage is visible. Build the new version in parallel. Migrate clients before you delete the old version.
