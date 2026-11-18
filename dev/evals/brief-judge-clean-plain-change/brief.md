## Brief

- Why: `npm run lint` fails on `main`. The variable `tax` in `src/orders.js` is never read.
- Goal: `npm run lint` exits 0.
- Targets: the repo `orders-api`, base `main`.
- Decisions:
  - Delete the variable `tax`. Because: see the records.
- Terms: none.
- FR:
  - `src/orders.js` has no variable `tax`. The JSON of `GET /orders/:id` stays the same.
- NFR:
  - No new dependency.
- Verification:
  - `npm run lint` exits 0.
  - `npm test` exits 0.
