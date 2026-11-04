const { can } = require('./acl');

function updateBooking(actor, booking, changes) {
  if (!can(actor, 'booking.write')) throw new Error('forbidden');
  return { ...booking, ...changes };
}

module.exports = { updateBooking };
