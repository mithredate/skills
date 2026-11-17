## Brief

- Why: `GET /orders/:id` returns `"total": null` for an order with no total. The orders of the load test have no total.
- Goal: `GET /orders/:id` returns `"total": 0` for an order with no total.
- Targets: the repo `orders-api`, base `main`.
- Decisions:
  - `toOrderJson` in `src/orders.js` returns `0` for a missing total. Because: see the records.
- Terms: none.
- FR:
  - `toOrderJson` returns `total: 0` for an order with no `total`.
  - `toOrderJson` returns the `total` of an order that has one, as before.
  - A test in `test/orders.test.js` covers an order with no `total`.
- NFR:
  - No new dependency.
- Verification:
  - `npm test` exits 0.
  - Run `scripts/delete-test-orders.sh` against the shared staging database. Then check that no order on staging returns `"total": null`.
