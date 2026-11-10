---
name: verification-before-completion
description: Use before claiming that work is done, fixed, or passing, and before a commit or a PR.
---

# Verification Before Completion

## Overview

Evidence comes before the claim, because the user, a reviewer, or a merge step acts on what you report.

Before you say that work passes, is fixed, or is done, run the check that shows it. Run the check after your last change and read its output. If no check can run, say which check you did not run and why.

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

## Red Flags

If one of these applies, run the check before you report, or say which check you did not run.

- A hedge such as "should pass" in place of output
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Thinking "just this once"
- Tired and wanting work over

## Key Patterns

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

---
_Adapted from [obra/superpowers/skills/verification-before-completion](https://github.com/obra/superpowers/tree/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/skills/verification-before-completion) — MIT © 2025 Jesse Vincent._
