PR title: feat(reports): let admins export the bookings as JSON

## Why

Finance copies the bookings by hand into a spreadsheet. Admins need an export.

## What

- A new permission group `REPORT` with `report.export` in `shared/permissions.js`.
- `exportBookings` in `server/reports.js`. It needs `report.export`.
- Tests for an admin and support.

## Decisions

- Only admins can export. The admin role holds every permission group by design.
- No change to the permissions of another role.

## Verified

- `node --test` passes.
