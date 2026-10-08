// A command line split the way the shell splits it. A word that names a tool asks, unless the guard can tell it is text or a read.
// An unknown form then costs one question, not a missed call.
// ponytail: no expansion. A program word built from a variable or a substitution, such as `$KUBECTL delete`, is not seen.

const TOOLS = new Set(['aws', 'aws-vault', 'kubectl', 'helm', 'terraform'])
// A tool's name inside a word, such as `kubectl/` or `/opt/bin/kubectl`, but not inside a longer name, such as `kubectl-prod`.
const TOOL_NAME = new RegExp(`(^|[^A-Za-z0-9_-])(${[...TOOLS].join('|')})(?![A-Za-z0-9_-])`)
const TERRAFORM_WRITES = new Set(['apply', 'destroy'])
// These programs never run the words they are given.
const TEXT_ONLY = new Set(['echo', 'printf', 'grep', 'rg', 'cat', 'git', 'gh', 'which', 'type'])
// A shell with no `-c` script reads its script from a pipe, a heredoc, a here-string, or a file.
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish'])
const SCRIPT_FLAG = /^-[A-Za-z]*c[A-Za-z]*$/

const AWS_READ_OPERATION = /^(get|describe|list)-/
const AWS_CREDENTIAL_OPERATION = /^get-(secret-value|login-password|session-token|federation-token|token|authorization-token|credentials|.*-credentials)$/
const KUBECTL_READ_VERBS = new Set(['get', 'describe', 'logs', 'top', 'explain', 'api-resources', 'api-versions', 'version'])
const KUBECTL_READ_CONFIG = new Set(['get-contexts', 'current-context'])
const HELM_READ_VERBS = new Set(['list', 'ls', 'status', 'history'])

// `command -v kubectl` names a command and runs nothing.
const LOOKUP_FLAGS = new Set(['-v', '-V'])

// A reserved word before a command, as in `if kubectl …` or `do kubectl …`.
const RESERVED_PREFIXES = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{'])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/
const REDIRECTION = /^(&>>|&>|<<<|<<-|<<|<&|>&|>>|>\||<>|<|>)/
const SEPARATORS = new Set([';', '&', '|', '(', ')'])
const BLANKS = new Set([' ', '\t'])
const WHITESPACE = /\s/

// A simple command: its words, and the text it reads from a heredoc or a here-string.
type Command = { words: string[]; input: string[] }
type Script = { commands: Command[]; nested: string[] }
type Heredoc = { delimiter: string; isQuoted: boolean; command: Command }

const basename = (word: string) => word.slice(word.lastIndexOf('/') + 1)
const endOf = (index: number, text: string) => (index < 0 ? text.length : index)

// The index of the `)` that closes the `(` before `from`.
function closingParen(text: string, from: number) {
  let depth = 1
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') i++
    else if (c === "'") i = endOf(text.indexOf("'", i + 1), text)
    else if (c === '"') i = closingQuote(text, i + 1)
    else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return i
  }
  return text.length
}

// The index of the `"` that closes a double-quoted string starting at `from`.
function closingQuote(text: string, from: number) {
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') i++
    else if (text.startsWith('$(', i)) i = closingParen(text, i + 2)
    else if (c === '"') return i
  }
  return text.length
}

function closingBacktick(text: string, from: number) {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === '`') return i
  }
  return text.length
}

// A double-quoted string's text. A substitution in it runs, so its script goes to `nested`.
function doubleQuoted(inner: string, nested: string[]) {
  let text = ''
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i] ?? ''
    if (c === '\\') text += inner[++i] ?? ''
    else if (inner.startsWith('$(', i)) {
      const end = closingParen(inner, i + 2)
      nested.push(inner.slice(i + 2, end))
      i = end
    } else if (c === '`') {
      const end = closingBacktick(inner, i + 1)
      nested.push(inner.slice(i + 1, end))
      i = end
    } else text += c
  }
  return text
}

// Gives each heredoc that the line before `from` opened its body, and returns the index after the bodies.
// The shell runs the substitutions in a body whose delimiter has no quotes.
function readHeredocs(text: string, from: number, heredocs: Heredoc[], nested: string[]) {
  let i = from
  for (const { delimiter, isQuoted, command } of heredocs) {
    const lines: string[] = []
    while (i < text.length) {
      const end = endOf(text.indexOf('\n', i), text)
      const line = text.slice(i, end)
      i = end + 1
      if (line.replace(/^\t+/, '') === delimiter) break
      lines.push(line)
    }
    const body = lines.join('\n')
    command.input.push(isQuoted ? body : doubleQuoted(body, nested))
  }
  return i
}

function splitScript(text: string): Script {
  const commands: Command[] = []
  const nested: string[] = []
  let command: Command = { words: [], input: [] }
  let word = ''
  let hasWord = false
  let isQuoted = false
  // The operator whose target the next word is. A file name target is dropped.
  let redirection: string | undefined
  let heredocs: Heredoc[] = []
  const endWord = () => {
    if (!hasWord) return
    if (redirection === '<<' || redirection === '<<-') heredocs.push({ delimiter: word, isQuoted, command })
    else if (redirection === '<<<') command.input.push(word)
    else if (redirection === undefined) command.words.push(word)
    redirection = undefined
    word = ''
    hasWord = false
    isQuoted = false
  }
  const endCommand = () => {
    endWord()
    redirection = undefined
    if (command.words.length) commands.push(command)
    command = { words: [], input: [] }
  }
  const substitute = (script: string) => {
    nested.push(script)
    word += '$(…)'
    hasWord = true
  }
  let i = 0
  while (i < text.length) {
    const c = text[i] ?? ''
    if (c === '\\') {
      if (text[i + 1] !== '\n') {
        word += text[i + 1] ?? ''
        hasWord = true
        isQuoted = true
      }
      i += 2
    } else if (c === '$' && (text[i + 1] === "'" || text[i + 1] === '"')) {
      // `$'…'` and `$"…"` quote a word as `'…'` and `"…"` do.
      i++
    } else if (c === "'") {
      const end = endOf(text.indexOf("'", i + 1), text)
      word += text.slice(i + 1, end)
      hasWord = true
      isQuoted = true
      i = end + 1
    } else if (c === '"') {
      const end = closingQuote(text, i + 1)
      word += doubleQuoted(text.slice(i + 1, end), nested)
      hasWord = true
      isQuoted = true
      i = end + 1
    } else if (text.startsWith('$(', i) || text.startsWith('<(', i) || text.startsWith('>(', i)) {
      const end = closingParen(text, i + 2)
      substitute(text.slice(i + 2, end))
      i = end + 1
    } else if (c === '`') {
      const end = closingBacktick(text, i + 1)
      substitute(text.slice(i + 1, end))
      i = end + 1
    } else if (text.startsWith('${', i)) {
      // A substitution inside the braces, as in `${X:-$(…)}`, runs too.
      const end = endOf(text.indexOf('}', i), text)
      word += doubleQuoted(text.slice(i, end + 1), nested)
      hasWord = true
      i = end + 1
    } else if (c === '#' && !hasWord) {
      i = endOf(text.indexOf('\n', i), text)
    } else if (c === '\n') {
      endCommand()
      i = readHeredocs(text, i + 1, heredocs, nested)
      heredocs = []
    } else if (BLANKS.has(c)) {
      endWord()
      i++
    } else if (c === '<' || c === '>' || (c === '&' && text[i + 1] === '>')) {
      // A file descriptor number before the operator belongs to the redirection, as in `2>&1`.
      if (/^\d+$/.test(word) && !isQuoted) {
        word = ''
        hasWord = false
      } else endWord()
      const operator = REDIRECTION.exec(text.slice(i))?.[0] ?? c
      redirection = operator
      i += operator.length
    } else if (SEPARATORS.has(c)) {
      endCommand()
      i++
    } else {
      word += c
      hasWord = true
      i++
    }
  }
  endCommand()
  return { commands, nested }
}

// The words from the program on, after reserved words and assignments, so `if grep kubectl …` is a text-only program.
function programWords(words: string[]) {
  let i = 0
  while (RESERVED_PREFIXES.has(words[i] ?? '')) i++
  while (ASSIGNMENT.test(words[i] ?? '')) i++
  return words.slice(i)
}

// Global flags sit between the tool and its verb, for example `--profile x` or `-n x`.
function positionalArgs(args: string[]) {
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    if (!arg.startsWith('-')) positional.push(arg)
    else if (!arg.includes('=') && positional.length < 2) i++
  }
  return positional
}

function isReadOnly(tool: string, args: string[]) {
  const [first, second] = positionalArgs(args)
  if (tool === 'aws') {
    if (args.includes('--with-decryption')) return false
    if (first === 's3' && second === 'ls') return true
    return AWS_READ_OPERATION.test(second ?? '') && !AWS_CREDENTIAL_OPERATION.test(second ?? '')
  }
  if (tool === 'kubectl') {
    if (first === 'config') return KUBECTL_READ_CONFIG.has(second ?? '')
    return KUBECTL_READ_VERBS.has(first ?? '') && !args.some(arg => /secret/.test(arg))
  }
  if (tool === 'helm') return HELM_READ_VERBS.has(first ?? '')
  if (tool === 'terraform') return !TERRAFORM_WRITES.has(first ?? '')
  return false
}

// The call from the tool's word on, unless it is a read.
function toolCall(words: string[]) {
  const [program = '', ...args] = words
  return isReadOnly(basename(program), args) ? [] : [words.join(' ')]
}

function privilegedCallsIn({ words, input }: Command, script: string): string[] {
  const run = programWords(words)
  const [program = '', ...args] = run
  const name = basename(program)
  if (TEXT_ONLY.has(name) || (name === 'command' && LOOKUP_FLAGS.has(args[0] ?? ''))) return []
  if (SHELLS.has(name) && !args.some(arg => SCRIPT_FLAG.test(arg))) return TOOL_NAME.test(script) ? [run.join(' ')] : []
  // Any other program can run a word it is given, as `sudo`, `xargs`, `find -exec`, and `watch` do.
  const calls = input.flatMap(privilegedCalls)
  for (const [i, word] of run.entries()) {
    if (!TOOL_NAME.test(word)) continue
    // A word with a blank in it is a script, as in `sh -c '…'`. A word that splits into itself is not.
    if (WHITESPACE.test(word) && word !== script) calls.push(...privilegedCalls(word))
    else if (TOOLS.has(basename(word))) return [...calls, ...toolCall(run.slice(i))]
    else return [...calls, run.join(' ')]
  }
  return calls
}

// Each call of a privileged tool in the command that is not a read, as written from the tool's word on.
export function privilegedCalls(command: string): string[] {
  const { commands, nested } = splitScript(command)
  return [...commands.flatMap(each => privilegedCallsIn(each, command)), ...nested.flatMap(privilegedCalls)]
}
