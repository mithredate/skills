// A mod's prompt starts with Claude Code's framing line, then the mod's own text.
const FRAMING = /^The .+ plugin sent a message:\s*/

export function firstPromptLine(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')
  const first = (lines[0] ?? '').replace(FRAMING, '')
  return first || lines[1] || ''
}
