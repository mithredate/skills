# Vendored-Skill Footer Format

This is the canonical spec for the attribution footer at the bottom of every vendored `SKILL.md`. Two skills depend on this format. [`import-skill`](../SKILL.md) writes it. [`refresh-vendored`](../../refresh-vendored/SKILL.md) reads it.

## Format

```
---
_<Verb> [<owner>/<repo>/<upstream-path>](https://github.com/<owner>/<repo>/tree/<sha>/<upstream-path>) — <license> <copyright>._
```

### Components

- **Verb**. This word encodes the current drift band:
  - `Adapted from`: local drift under 30%
  - `Inspired by`: local drift from 30% to 80%
  - `Originally seeded from`: local drift over 80%
- **owner/repo/upstream-path**. This is the human-readable identifier of the source skill.
- **URL**. It must include `/tree/<sha>/<path>`. The `<sha>` is the **fork commit**, the upstream SHA at which the agent last reviewed or refreshed the skill. `import-skill` sets it first, at vendor time. `refresh-vendored` updates it whenever the user adopts an upstream change.
- **license**. This is the SPDX identifier, for example `MIT` or `Apache-2.0`.
- **copyright**. This follows the form `© <year> <holder>`, for example `© 2026 Matt Pocock`.

### Examples

```
---
_Adapted from [mattpocock/skills/skills/productivity/grill-me](https://github.com/mattpocock/skills/tree/b39bb0b27867/skills/productivity/grill-me) — MIT © 2026 Matt Pocock._
```

```
---
_Inspired by [mattpocock/skills/skills/engineering/tdd](https://github.com/mattpocock/skills/tree/abc1234/skills/engineering/tdd) — MIT © 2026 Matt Pocock._
```

## Parsing rules

The leading `---` is a markdown horizontal rule. It sits on its own line, directly before the italic footer line. The footer line must match this fixed pattern:

```
^_(?<verb>Adapted from|Inspired by|Originally seeded from) \[(?<label>[^\]]+)\]\((?<url>https://github\.com/(?<owner>[^/]+)/(?<repo>[^/]+)/tree/(?<sha>[a-f0-9]+)/(?<path>[^)]+))\) — (?<license>\S+) (?<copyright>©[^.]+)\._$
```

`refresh-vendored` flags a skill with a footer that does not match this pattern. It marks the skill malformed and skips it until a person fixes it by hand.
