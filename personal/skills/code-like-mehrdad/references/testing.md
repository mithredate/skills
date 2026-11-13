# Testing rubric

This rubric states how to write and judge tests. Use it when you write tests, change tests, or review a diff that touches tests.

## What a test is for

- Tests verify **behavior, not implementation**. This is the bar for every test. It must catch a future regression. A test that locks in implementation details fails this bar.
- Prefer integration-style tests with **real round-trips** over tests that mock everything. A real round-trip can use a real database or a real HTTP layer. Mock only at system boundaries you do not own. Do not mock your own layers to make a unit "pure".
- Use mock libraries sparingly. Before you choose a mock, ask whether a real fixture and a real call path cover it.
- **DAMP over DRY** in test code: a test must read as a self-contained story. Duplication that aids readability beats an abstraction that hides the scenario.
- Put each expected value in a named variable, such as `expected`, and assert against it. Do not build the expected value inside the assertion.
- Name the result of the act step `sut`. In a class test, `sut` is the instance. In an exception test, put the call inside `expect` and bind no `sut`.
- Assert whole objects with `toEqual`. Use a partial match only when the rest of the object is not relevant to the behavior.
- Test one behavior per test. For several data rows, use `it.each`. Put no condition inside a test body or an `it.each` callback. If the arrange step differs by row, write separate tests, because a branch makes the reader simulate the setup.

## Fixtures

- **Build with the factory.** A test builds an entity with the existing factory. It sets each value that the assertion reads. A helper that remains is `createX` when it persists the entity, and `makeX` when it does not.
- **Reuse before creating.** Never introduce a parallel fixture builder for an entity that already has one. Search the shared fixtures folder of the project first, such as `tests/fixtures/`.
- **Placement follows usage scope**: a builder used by multiple test files lives in the shared fixtures folder. Builders there are organized per layer. A builder used by a single test file stays local to that file.
- **Compose, don't fork.** Derive a variant from an existing builder, for example `toUserDTO(makeUser(...))`. Do not write a sibling builder.
- **Name by layer.** A fixture's name states what layer it builds: `makeUser` for a domain entity, `makeUserResponseDto` for the API DTO. "Record", "data", "obj" are not layers.
- **Variant seeders.** When the domain type is a discriminated union, give the seed helpers one function for each variant. Examples are `seedDraftOrder` and `seedApprovedOrder`. Each function fills the fields that its state requires. A test then does not need to know the rules of each state.
- **Test-database guard.** The test config refuses a database whose name does not contain "test". A destructive helper, such as one that truncates every table, then cannot reach a real database through a wrong env var.

## Coverage

- Coverage can only increase. A diff that lowers coverage needs an explicit justification.
- **State machines and transition matrices get exhaustive coverage.** Every cell is a test. This includes a cell for a rejection, such as an HTTP 4xx response. A missing cell is a review finding.
- When the app breaks but the suite is green, treat the suite itself as a second bug. Find the missing test that would have caught the break. Add that test.

## Flakiness

- Allow no flaky tests. A flaky test must be fixed or deleted. Do not retry it many times instead.
- Time-based assertions must be bounded, not exact. Capture `before` and `after` timestamps. Assert `before <= result <= after`.
- Compare timestamps in a format that keeps the milliseconds and the timezone. For example, in TypeScript, compare `expected.toISOString()` with `actual.toISOString()`.
