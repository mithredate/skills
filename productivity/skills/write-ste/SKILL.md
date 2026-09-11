---
name: write-ste
description: States the Simplified Technical English rules for every text we write, with the check to run before you finish. Use when you write a skill, an agent file, a reference, a PR body, a review finding, a report, or an AGENTS.md line, or when another skill needs the writing rules.
---

# Write STE

**Simplified Technical English** (STE) is the ASD-STE100 controlled language. This file holds the subset we apply to every text that we author. Vendored skills are exempt. The specification is free on registration at https://www.asd-ste100.org/.

## Words

- One word has one meaning. Use the same word for the same thing in the whole file. Do not vary words for style.
- Prefer the short common verb: do, use, make, start, stop, check, write, read, delete, move, run, open, close, list, show, give, get, keep, put.
- These words are not allowed: perform, utilize, initiate, terminate, facilitate, leverage, ensure, prior to, in order to. Write "make sure" for ensure, "before" for prior to, and "to" for in order to.
- Do not write "should" or "may". Write "must" for a rule and "can" for a possibility.
- Do not use metaphors, idioms, or images. A word such as "frontier" is allowed only as a defined term of the file.
- Do not use a noun as a verb or a verb as a noun. Write "check", not "do a check".
- A technical name is a fixed word. This includes a file name, a command, a tool, a flag, and a defined term. Keep it exactly. Put it in backticks.
- A **defined term** is introduced once in bold with a one-sentence definition. After that, use it without explanation.

## Sentences

- A procedure sentence has 20 words maximum. A description sentence has 25 words maximum.
- One instruction per sentence. One idea per sentence.
- Use the active voice. Name the actor: "the agent", "the user", "you".
- Write an instruction in the imperative: "Read the file." Write a description in the present tense: "The file holds the rules."
- Start a condition with "if" or "when" and put it before the instruction: "If the file is longer than 200 lines, move the section."
- Do not join independent clauses with a semicolon or a colon. Write two sentences.
- Do not use an arrow, a slash for "or", or parentheses that hold a second idea. Write the second idea as its own sentence.
- Use articles: "the manifest", "a rule". Do not write "manifest lists scripts".
- Do not use an -ing form as a noun or as a sentence opener. Write "Housekeep the destination", not "Housekeeping the destination".
- Put no more than three nouns in a row.

## Paragraphs and lists

- One topic per paragraph. Six sentences maximum per paragraph.
- A sequence of actions is a numbered list. A set of items is a bulleted list. One item, one line.
- Every item in one list is a full sentence, or every item is a noun phrase. Do not mix the two.
- A heading is a noun phrase or an imperative, not a question.
- Put the warning or the condition before the action it applies to.

## Check before you finish

1. Read every sentence. Count the words. Split any sentence over the limit.
2. Search the file for: should, may, ensure, perform, an arrow, a semicolon. Each hit is a defect.
3. Search for figurative words. Each hit is a defect.
4. Search for two words that name the same thing. Keep one.
