// An older reply shows this many lines. A reply only folds when it hides at least as many.
const SHOWN_LINES = 3
const FENCE = /^\s*```/

// The first lines of a reply and a count of the rest, or undefined when the reply is short.
export function foldReply(text: string) {
  const lines = text.split('\n')
  if (lines.length <= SHOWN_LINES * 2) return undefined
  const head = lines.slice(0, SHOWN_LINES)
  // A code fence opened in the head must close, or the count line draws as code.
  if (head.filter(line => FENCE.test(line)).length % 2 === 1) head.push('```')
  return [...head, `_… ${lines.length - SHOWN_LINES} more lines (ctrl+o)_`].join('\n')
}

// A mod's prompt starts with Claude Code's framing line, then the mod's own text.
export function promptLine(name: string, text: string) {
  const lines = text.split('\n').filter(line => line.trim() !== '')
  const body = lines[0] === `The ${name} plugin sent a message:` ? lines.slice(1) : lines
  return `› ${name}: ${body[0] ?? ''}`
}
