# Testing rubric

This rubric states how to write and judge tests. Use it when you write tests, change tests, or review a diff that touches tests.

## What a test is for

- Tests verify **behavior, not implementation**. This is the bar for every test. It must catch a future regression. A test that locks in implementation details fails this bar.
- Prefer integration-style tests with **real round-trips** over tests that mock everything. A real round-trip can use a real database or a real HTTP layer. Mock only at system boundaries you do not own. Do not mock your own layers to make a unit "pure".
- Use mock libraries sparingly. Before you choose a mock, ask whether a real fixture and a real call path cover it.
- **DAMP over DRY** in test code: a test must read as a self-contained story. Duplication that aids readability beats an abstraction that hides the scenario.

## Fixtures

- **Reuse before creating.** Never introduce a parallel fixture builder for an entity that already has one. Search `tests/fixtures/` first.
- **Placement follows usage scope**: a builder used by multiple test files lives in `tests/fixtures/`. Builders there are organized per layer. A builder used by a single test file stays local to that file.
- **Compose, don't fork.** Derive a variant from an existing builder, for example `toUserDTO(makeUser(...))`. Do not write a sibling builder.
- **Name by layer.** A fixture's name states what layer it builds: `makeUser` for a domain entity, `makeUserResponseDto` for the API DTO. "Record", "data", "obj" are not layers.

## Coverage

- Coverage is a **ratchet**: it can only increase. A diff that lowers coverage needs an explicit justification.
- **State machines and transition matrices get exhaustive coverage.** Every cell is a test. This includes a cell for a rejection, such as an HTTP 4xx response. A missing cell is a review finding. It is not optional.
- When the app breaks but the suite is green, treat the suite itself as a second bug. Find the missing test that would have caught the break. Add that test.

## Flakiness

- Allow no flaky tests. A flaky test must be fixed or deleted. Do not retry it many times instead.
- Time-based assertions must be bounded, not exact. Capture `before` and `after` timestamps. Assert `before <= result <= after`.
- Timestamp assertions compare named `Date` variables via `.toISOString()`. Do not construct a date inline inside `expect`.
