## Brief

- Why: `npm run lint` fails on `main`. The variable `tax` in `src/orders.js` is never read.
- Goal: `npm run lint` exits 0, and CI fails a PR with a lint error.
- Targets: the repo `orders-api`, base `main`.
- Decisions:
  - Delete the variable `tax`. Because: see the records.
  - CI runs `npm run lint` on each PR. Because: see the records.
- Terms: none.
- FR:
  - `src/orders.js` has no variable `tax`. The JSON of `GET /orders/:id` stays the same.
  - `.github/workflows/ci.yml` runs `npm run lint` after `npm test`.
- NFR:
  - No new dependency.
- Verification:
  - `npm run lint` exits 0.
  - `npm test` exits 0.
