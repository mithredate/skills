# Testing rubric

This rubric states how to write and judge tests. Use it when you write tests, change tests, or review a diff that touches tests.

## What a test is for

- Tests verify **behavior, not implementation**. This is the bar for every test. It must catch a future regression. A test that locks in implementation details fails this bar.
- Prefer integration-style tests with **real round-trips** over tests that mock everything. A real round-trip can use a real database or a real HTTP layer. Mock only at system boundaries you do not own. Do not mock your own layers to make a unit "pure".
- Use mock libraries sparingly. Before you choose a mock, ask whether a real fixture and a real call path cover it.
- **DAMP over DRY** in test code: a test must read as a self-contained story. A test names only the values that decide its result, and a fixture factory fills every other value. For example, a test of a member discount names the item price, the discount, and the order total. Duplication that aids readability beats an abstraction that hides the scenario.
- Put each expected value in a named variable, such as `expected`, and assert against it. Do not build the expected value inside the assertion.
- Name the system under test `sut`. It is the unit that the test calls, such as a repository, and never the result of the call. Name the result of the act step `actual`, and compare it with `expected`. For example, write `sut = new OrderRepository(db)` and then `actual = sut.findOrdersOfCustomer(customerId)`. A test of a plain function binds no `sut`. In an exception test, put the call inside `expect` and bind no `actual`.
- Assert only what the test name promises. One test of a unit asserts the whole object with `toEqual`. Each other test asserts the field that its behavior decides.
- Test one behavior per test. For several data rows, use `it.each`. Put no condition inside a test body or an `it.each` callback. If the arrange step differs by row, write separate tests, because a branch makes the reader simulate the setup.

## Fixtures

- **Build with the factory.** A test builds an entity with the existing factory. It sets only the values that decide its result. A helper that remains is `createX` when it persists the entity, and `makeX` when it does not.
- **Reuse before creating.** Never introduce a parallel fixture builder for an entity that already has one. Search the shared fixtures folder of the project first, such as `tests/fixtures/`.
- **Project-wide fixtures.** A new fixture is a state of a factory in the shared fixtures folder, such as `forCustomer(customer)` of an order factory. Write a small state that tests combine, because a state for one test case serves no other test. Do not add a builder method to a test class. Builders in the shared folder are organized per layer.
- **Typed parameters.** A factory state takes a domain object, not an array of raw fields. The factory turns the object into the stored format with the production code that writes that format.
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
