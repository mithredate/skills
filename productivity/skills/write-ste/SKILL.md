---
name: write-ste
description: Use when writing a skill, an agent file, a reference, a PR body, a review finding, or a report.
---

# Write STE

**Simplified Technical English** (STE) is the ASD-STE100 controlled language. This file holds the subset we apply to every text that we author. Vendored skills are exempt. The specification is free on registration at https://www.asd-ste100.org/.

STE is a standard for English only. This file states each rule as a principle, so that the rule also applies to a text in another language. A **word file** holds the words of one language for this skill. Its path is `references/words-<code>.md`, where `<code>` is the two-letter code of the language.

## First actions

Do these steps before you write or check a text.

1. Name the language of the text. A technical name or a quote in another language does not change the language.
2. Read the word file of that language. [references/words-en.md](references/words-en.md) is for English. [references/words-de.md](references/words-de.md) is for German.
3. If the language has no word file, apply the principles without a word file. Write in your answer that the word check did not run for that language.

## Words

- One word has one meaning. Use the same word for the same thing in the whole file. Do not vary words for style.
- Prefer the short common verb, such as "use" in English and "nutzen" in German. The word file lists these verbs.
- Do not use a word that the word file bans. Write the short common word in its place. Write "use", not "utilize". In German, write "mit", not "mittels".
- Write a rule as a duty and a possibility as a possibility. Do not use a word that makes a rule optional. Write "must", not "should". In German, write "muss", not "sollte".
- Do not use metaphors, idioms, or images. A word such as "frontier" is allowed only as a defined term of the file.
- Do not use a noun as a verb or a verb as a noun. Write "check", not "do a check". In German, write "prüfen", not "eine Prüfung durchführen".
- A technical name is a fixed word. This includes a file name, a command, a tool, a flag, and a defined term. Keep it exactly. Put it in backticks.
- A **defined term** is introduced once in bold with a one-sentence definition. After that, use it without explanation.

## Sentences

- Write short sentences. Write one idea per sentence.
- An **agent text** is a text that agents read, such as a skill, an agent file, a reference, or a brief. The text for agents at the end of any text is an agent text too. An example is the `<details>` block of a PR body.
- In an agent text, a procedure sentence has 20 words maximum. A description sentence has 25 words maximum. Write one instruction per sentence.
- A text that people read has no word limit per sentence. Examples are a chat message, a report, a PR body, and a review finding.
- Use the active voice. Name the actor: "the agent", "the user", "you".
- Write an instruction in the imperative: "Read the file." Write a description in the present tense: "The file holds the rules."
- Put a condition before the instruction. Start the condition with the condition word of the language. Examples are "if" and "when" in English, and "wenn" and "falls" in German. For example, write "If the file is longer than 200 lines, move the section."
- Do not join independent clauses with a semicolon or a colon. Write two sentences.
- Do not use an arrow, a slash for "or", or parentheses that hold a second idea. Write the second idea as its own sentence.
- Write each article that the grammar of the language needs. Write "The manifest lists the scripts", not "manifest lists scripts". In German, write "Das Manifest listet die Skripte auf", not "Manifest listet Skripte auf".
- Write an action as a verb. Do not make the action a noun, and do not open a sentence with that noun. Write "Check the manifest", not "Checking the manifest". In German, write "Prüfen Sie die Datei", not "Die Prüfung der Datei erfolgt".
- A noun group has three nouns at most. A **noun group** is a row of nouns with no other word between them. A compound is a noun group in one word, so count each noun in it. The English "user account settings page" has four nouns. The German "Benutzerkontoeinstellungsseite" has four nouns too.

## Paragraphs and lists

- One topic per paragraph. Six sentences maximum per paragraph.
- A sequence of actions is a numbered list. A set of items is a bulleted list. One item, one line.
- In a text that people read, write a short paragraph where the ideas connect. Keep lists for separate items.
- Every item in one list is a full sentence, or every item is a noun phrase. Do not mix the two.
- A heading is a noun phrase or an imperative, not a question.
- Put the warning or the condition before the action it applies to.

## Check before you finish

1. In an agent text, read every sentence. Count the words. Split any sentence over the limit.
2. Search the text for each word that its word file bans. Also search for an arrow, a slash for "or", and a semicolon. Each hit is a defect. A hit inside backticks is not a defect.
3. Search for figurative words. Each hit is a defect.
4. Search for two words that name the same thing. Keep one.
