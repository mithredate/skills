## Brief

- Why: The shop shows prices in euro, but the JSON of `GET /orders/:id` has no currency.
- Goal: The JSON of `GET /orders/:id` has the field `currency` with the value `EUR`, and no field `customerEmail`.
- Targets: the repo `orders-api`, base `main`.
- Decisions:
  - `toOrderJson` in `src/orders.js` sets the field `currency`. Because: see the records.
  - The JSON of `GET /orders/:id` loses the field `customerEmail`. Because: see the records.
- Terms: none.
- FR:
  - `toOrderJson` returns the field `currency` with the value `EUR` for each order.
  - `toOrderJson` returns no field `customerEmail`.
  - The test in `test/orders.test.js` expects the field `currency` and no field `customerEmail`.
- NFR:
  - No new dependency.
- Verification:
  - `npm test` exits 0.
