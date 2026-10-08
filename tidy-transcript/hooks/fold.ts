// An older reply shows this many lines. It folds only when it has more than twice as many.
const SHOWN_LINES = 3
// A line that only opens or closes a code fence, such as ```bash or ~~~.
const FENCE = /^\s*(`{3,}|~{3,})[^`~]*$/

// The first lines of a reply and a count of the rest, or undefined when the reply is short.
export function foldReply(text: string) {
  const lines = text.split('\n')
  if (lines.length <= SHOWN_LINES * 2) return undefined
  const head = lines.slice(0, SHOWN_LINES)
  // A code fence opened in the head must close, or the count line draws as code.
  const fences = head.filter(line => FENCE.test(line))
  if (fences.length % 2 === 1) head.push(fences[0]?.trim().match(FENCE)?.[1] ?? '```')
  // The blank line keeps a list or a quote in the head from taking in the count line.
  return [...head, '', `_… ${lines.length - SHOWN_LINES} more lines (ctrl+o)_`].join('\n')
}

// A mod's prompt starts with Claude Code's framing line, then the mod's own text.
const FRAMING = /^The .+ plugin sent a message:\s*/

export function firstPromptLine(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')
  const first = (lines[0] ?? '').replace(FRAMING, '')
  return first || lines[1] || ''
}
