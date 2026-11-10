---
name: systematic-debugging
description: Use on any bug, failing test, broken build, or unexpected behaviour, before proposing a fix.
---

# Systematic Debugging

## First actions

Before your next tool call, call the Skill tool with `dev:tdd` and `dev:verification-before-completion`. This step is done when both skills are loaded.

## Overview

A fix for a symptom hides the cause, and the bug comes back in another place. So Phase 1 comes before any fix.

This holds for a simple bug and for an urgent bug. Both have a root cause, and guessing costs more time than a search.

## Phase 1: Root Cause Investigation

Find the root cause before you propose a fix. The root cause is the first place where the value or the state goes wrong.

## Phase 2: Hypothesis and Testing

1. **Test Minimally**
   - Test one hypothesis at a time, with the smallest change that confirms or refutes it.

2. **When You Don't Know**
   - Say "I don't understand X"
   - Don't pretend to know
   - Gather evidence for X

## Phase 3: Implementation

1. **Create Failing Test Case**
   - Simplest possible reproduction
   - Automated test if possible
   - One-off test script if no framework
   - Write it before the fix

2. **Verify Fix**
   - Run the verification before you claim success

3. **If Fix Doesn't Work**
   - After one or two failed fixes, return to Phase 1 with what the failed fix showed.
   - After three failed fixes, do not try a fourth before the architecture question is settled. Go to step 4.

4. **If 3+ Fixes Failed: Question Architecture**

   Three failed fixes point to a wrong architecture, not a wrong hypothesis. Other signs are new shared state or coupling in a different place with each fix, a large refactor to implement a fix, and new symptoms elsewhere.

   Sort the architecture question with `productivity:settle-decisions` before you attempt more fixes.

## Signals from the user

If the user asks whether something really happens, asks what the evidence shows, or says that you are guessing or stuck, go back to Phase 1.

---
_Inspired by [obra/superpowers/skills/systematic-debugging](https://github.com/obra/superpowers/tree/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/skills/systematic-debugging) — MIT © 2025 Jesse Vincent._
