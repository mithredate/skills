import type { SessionMessage, ToolUseSummary } from 'claude-code'

export type Dir = { dir: string; reads: number; edits: number }
export type SessionFacts = { skills: string[]; dirs: Dir[]; bash: ToolUseSummary[] }

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob'])
// These tools take a folder as their `path`. The others take a file.
const FOLDER_TOOLS = new Set(['Grep', 'Glob'])
const COMMAND_NAME = /<command-name>\/?([^<\s]+)<\/command-name>/g

const str = (value: unknown) => (typeof value === 'string' ? value : '')

// A path as the pane shows it: relative to the project root, or under `~` for the home folder.
export function shortPath(path: string, root: string, home: string | undefined) {
  if (path === root) return '.'
  if (path.startsWith(`${root}/`)) return path.slice(root.length + 1)
  if (home && path === home) return '~'
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`
  return path
}

// The skills in the order the session first used them, the folders it touched with the latest first, and its shell commands.
export function sessionFacts(messages: readonly SessionMessage[], root: string, home: string | undefined): SessionFacts {
  const skills = new Set<string>()
  const dirs = new Map<string, Dir>()
  const bash: ToolUseSummary[] = []
  for (const message of messages) {
    if (message.role === 'user') for (const match of message.text.matchAll(COMMAND_NAME)) skills.add(match[1] ?? '')
    for (const use of message.toolUses) {
      if (use.tool === 'Skill') skills.add(str(use.input.skill))
      if (use.tool === 'Bash') bash.push(use)
      const isEdit = EDIT_TOOLS.has(use.tool)
      const path = str(use.input.file_path) || str(use.input.notebook_path) || str(use.input.path)
      if (!path || !(isEdit || READ_TOOLS.has(use.tool))) continue
      const folder = FOLDER_TOOLS.has(use.tool) ? path : path.slice(0, path.lastIndexOf('/')) || '/'
      const dir = shortPath(folder, root, home)
      const entry = dirs.get(dir) ?? { dir, reads: 0, edits: 0 }
      if (isEdit) entry.edits += 1
      else entry.reads += 1
      // Set again after the delete, so the map's order is the order of last use.
      dirs.delete(dir)
      dirs.set(dir, entry)
    }
  }
  return { skills: [...skills].filter(Boolean), dirs: [...dirs.values()].reverse(), bash }
}
