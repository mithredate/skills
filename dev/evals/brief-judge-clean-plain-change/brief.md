## Brief

- Why: The shop shows prices in euro, but the JSON of `GET /orders/:id` has no currency.
- Goal: The JSON of `GET /orders/:id` has the field `currency` with the value `EUR`.
- Targets: the repo `orders-api`, base `main`.
- Decisions:
  - `toOrderJson` in `src/orders.js` sets the field. Because: see the records.
- Terms: none.
- FR:
  - `toOrderJson` returns the field `currency` with the value `EUR` for each order.
  - The other fields of the JSON stay the same.
  - The test in `test/orders.test.js` expects the field `currency`.
- NFR:
  - No new dependency.
- Verification:
  - `npm test` exits 0.
