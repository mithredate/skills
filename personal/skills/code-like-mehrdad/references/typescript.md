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

- **Check existing utils before writing new code.** Grep `utils/`, sibling components, and shared modules first.
- A type used by more than one module moves to the shared types location, such as `shared/` or `app/types/`. Do not duplicate a type definition. Do not define a type inside a component.

## Functions and data

- **Spread the existing value.** For a partial update, write `{ ...existing, ownedField: value }`. Do not rebuild the object property by property. A rebuilt object silently drops a field that the type gets later.
