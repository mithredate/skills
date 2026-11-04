const test = require('node:test');
const assert = require('node:assert');
const { updateBooking } = require('../server/bookings');

test('support updates a booking', () => {
  const support = { roles: ['support'] };
  const expected = { id: 1, seats: 2 };

  const sut = updateBooking(support, { id: 1, seats: 1 }, { seats: 2 });

  assert.deepStrictEqual(sut, expected);
});

test('an agent cannot update a booking', () => {
  const agent = { roles: ['agent'] };

  assert.throws(() => updateBooking(agent, { id: 1, seats: 1 }, { seats: 2 }), /forbidden/);
});
