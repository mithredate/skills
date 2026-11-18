import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toOrderJson } from '../src/orders.js';

test('an order has the JSON of GET /orders/:id', () => {
  const order = { id: 7, status: 'paid', total: 20, customerEmail: 'buyer@example.com' };
  const expected = { id: 7, status: 'paid', total: 20, customerEmail: 'buyer@example.com' };

  const actual = toOrderJson(order);

  assert.deepEqual(actual, expected);
});
