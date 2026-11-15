---
name: unslop
description: Use for every text written for a human, such as a PR body, a doc, or a message.
---

# Unslop

Edit text to remove AI patterns. Scan for the patterns below, then rewrite. Preserve meaning and match the intended tone.

## First actions

Do these steps before you scan a text.

1. Name the language of the text. A technical name or a quote in another language does not change the language.
2. Read the word file of that language, `references/words-<code>.md`. [references/words-en.md](references/words-en.md) is for English. [references/words-de.md](references/words-de.md) is for German. It holds the word lists of rules 3, 7, 8, 20, 23, 26, and 31.
3. If the language has no word file, apply the patterns without a word file. Write in your answer that the word check did not run for that language.

## Patterns to detect and fix

Rule numbers are stable ids that other skills cite. A removed rule leaves a gap.

Each rule applies in every language. Its examples are English and German.

### Content

3. **Superficial trailing phrases.** A phrase at the end of a sentence that comments on the fact and adds no fact. English: "..., highlighting its importance". German: "..., was die Bedeutung unterstreicht". The word file lists more. Delete or expand with real sources.
5. **Vague attributions.** "Experts believe", "Industry reports suggest", "Some critics argue", or "Experten sind sich einig" in German. Name the source or delete.

### Language

7. **AI vocabulary.** Words that AI text overuses, such as "delve" and "pivotal" in English, or "nahtlos" and "ganzheitlich" in German. The word file lists them. Replace with plain words.
8. **Fancy ways to say "is".** English: "serves as", "boasts". German: "fungiert als", "verfügt über". The word file lists more. Say "is" or "has".
9. **"Not just X, but Y."** In German, "nicht nur X, sondern auch Y". State the point directly instead.
10. **Rule of three.** Don't force ideas into groups of three. Use the natural number.
11. **Synonym cycling.** Protagonist, main character, central figure, hero all in one paragraph. Pick one, repeat it.
12. **False ranges.** "from X to Y", or "von X bis Y" in German, where X and Y aren't on a meaningful scale. List topics directly.

### Style

13. **Em dash overuse.** Avoid em dashes entirely. Use periods or commas only (no parentheses, no en dashes, no hyphen-as-dash substitutes). If a thought needs separation, end the sentence or use a comma.
14. **Colon overuse.** Colons are fine before a list or example, not as mid-sentence connectors. "If you're coming from traditional automation: instead of registering event handlers, you describe conditions" adds nothing with the colon. Rewrite to let the point stand on its own without comparison framing. "You describe the conditions that make the scheduler fire." Same meaning, no crutch punctuation.
15. **Boldface overuse.** Don't bold every proper noun or acronym.
16. **Inline-header lists.** The tell is a bold label and colon that restates the line: "**Performance:** Performance improved...". Convert those to prose. A bold lead-in that ends in a period, names the item, and is followed by genuinely new detail ("**Schema in TypeScript.** Tables live in one file.") is fine, not a tell.
17. **Title case headings.** Write a heading with the capitals of a normal sentence. English: "Check before you finish", not "Check Before You Finish". German: "Prüfung vor dem Abschluss", where each noun keeps its capital.
18. **Decorative emojis.** Remove from headings and bullets.
19. **Quote marks.** Use the standard quotes of the language, the same in the whole text. English: straight quotes as in "text", not curly quotes. German: „Text“.

### Communication artifacts

20. **Chatbot phrases.** "I hope this helps!", "Let me know if...", or "Ich hoffe, das hilft!" in German. The word file lists more. Remove.
22. **Sycophantic tone.** "Great question! You're absolutely right!", or "Gute Frage! Sie haben völlig recht!" in German. Respond directly.

### Filler

23. **Filler phrases.** English: "In order to" becomes "To". German: "Aufgrund der Tatsache, dass" becomes "Weil". The word file lists more.
24. **Excessive hedging.** "could potentially possibly be argued that it might" becomes "can", or the plain claim. German: "könnte unter Umständen möglicherweise" becomes "kann".
25. **Generic conclusions.** "The future looks bright.", or "Die Zukunft bleibt spannend." in German. State specific plans or facts.

### Jargon

26. **Abstract metaphor nouns.** English: "substrate" becomes "base". German: "Stellschraube" becomes "Parameter". The word file lists more. These read as technical but usually have a plainer concrete word. Pick the concrete word.

### Plain speech

27. **Say what it does, not how it feels.** "the database stays close at hand", "SQL you can read", "types that follow your schema" name a feeling. The fix names the mechanism or a number: "`.toSQL()` returns the exact string sent to the database", "a column rename fails the build". Ask what the sentence tells the reader to do or know, then write that. If you can't restate it as a concrete instruction, fact, or number, cut it. One more check: if the sentence could appear unchanged in another project's docs, it says nothing about this one. Cut it.
28. **Shorten or split dense sentences.** If the reader has to backtrack to parse a sentence, break it in two or drop clauses. One idea per sentence.
29. **Active voice.** Prefer it. Catch the passive form of the language and name the actor. English: "queries are validated" becomes "the compiler validates queries". German: "die Datei wird geprüft" becomes "der Loader prüft die Datei". Passive is fine only when the actor is unknown or genuinely doesn't matter.
30. **Cut adverbs, or use a stronger verb.** "runs quickly" becomes "is fast" or the number, and "significantly improves" becomes the measured delta. An adverb propping up a weak verb means the verb is wrong.
31. **Prefer the plain word.** English: "utilize" becomes "use". German: "mittels" becomes "mit". The word file lists more. The fancier synonym is rarely clearer.
32. **Mannered prose.** Metaphor or flourish where a literal phrase exists: aphorisms ("wire it or delete it"), rhetorical fragments for effect, personified code ("the plan holds it"), figurative verbs ("rides along", "stands on"), stock framing phrases. "A dial worth turning" becomes "a parameter worth varying". Say what you mean. Rule 26 covers the metaphor nouns.
33. **Over-compression.** Dropped articles, verbless fragments, symbol-speak, and abbreviations that make the reader decode instead of read. "Parser rejects bad date → exit 2, no write" becomes "The parser rejects a bad date, exits with code 2, and writes nothing." Write whole sentences with their articles and verbs, and spell out arrows and abbreviations.
---
_Inspired by [cursor/plugins/pstack/skills/unslop](https://github.com/cursor/plugins/tree/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/unslop) — MIT © 2026 Lauren Tan._
