# orders-api

A small HTTP API for the orders of the shop. The checkout team and the support team call `GET /orders/:id`.

- `src/orders.js` builds the JSON of `GET /orders/:id`.
- A change of that JSON comes with a test in `test/orders.test.js`.
- Test with `npm test`. Lint with `npm run lint`.
- CI runs `.github/workflows/ci.yml` on each PR.
