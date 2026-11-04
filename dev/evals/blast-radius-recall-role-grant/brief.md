PR title: feat(bookings): let admins refund a booking

## Why

Finance refunds a booking by hand in the database. Admins need a refund action in the app.

## What

- A new permission `booking.refund` in the booking group of `shared/permissions.js`.
- `refundBooking` in `server/bookings.js`. It needs `booking.refund`.
- Tests for an admin and a team lead.

## Decisions

- Only admins can refund.
- No change to an existing role.

## Verified

- `node --test` passes.
