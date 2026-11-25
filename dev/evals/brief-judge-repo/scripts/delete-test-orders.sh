#!/usr/bin/env bash
# Deletes the orders of the load test in the shared staging database.
set -euo pipefail
psql "$STAGING_DATABASE_URL" -c "DELETE FROM orders WHERE is_test"
