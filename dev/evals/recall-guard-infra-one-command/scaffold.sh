#!/usr/bin/env bash
# The head is b612f0b with one test line changed to drop private repo names.
exec bash "$(dirname "$0")/../scaffold.sh" "$(dirname "$0")" aad8879 033a775
