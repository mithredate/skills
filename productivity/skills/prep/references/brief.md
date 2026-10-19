# Brief

A brief is one `## Brief` section. A build `task` ticket of `orchestrate` holds it as its body. Without a ticket, it is the whole file `brief.md`.

```
## Brief

- Why: <the problem, and who has it. One or two sentences>
- Goal: <what is true when the session hands back>
- Targets: <each git repo with its base branch, or each other system, for example an n8n instance>
- Decisions: <each closed decision that the build must follow, one line each, with a link to its ticket or ADR. Optional>
- FR: <behavior that a caller, a user, or a test can see, one sub-bullet for each requirement>
- NFR: <limits, one sub-bullet for each limit: security, performance, allowed new dependencies, what stays unbuilt>
- Verification: <how the session proves it, with real commands and data, and the checks that pass before the hand-back. For a bugfix, the failing test first>
```

Each pair below shows a line that gives the how, then the same line rewritten.

<examples>
<example>
Bad: `- Why: Build the agent API.` This repeats the Goal.
Good: `- Why: The Damage Dispute agent reads bookings through a shared admin login. Each read must carry the identity of the caller.`
</example>
<example>
Bad: `- FR: A custom authenticator in src/AgentApiModule/ checks the token against the JWKS.`
Good: `- FR: A call with an expired token, or a token for another audience, returns 401.`
</example>
<example>
Bad: `- Read first: AzureLoginService.php. Copy the JWKS check, not the appid check.`
Good: `- Decisions: A custom authenticator, not the existing firewall. It checks aud, not appid. [Write the phase 1 MVP brief](tickets/wmcp-23.md)`
</example>
<example>
Bad: `- NFR: Add an index on order.booking_number.`
Good: `- NFR: The order list returns in under 200 ms for a booking with 100 orders.`
</example>
</examples>
