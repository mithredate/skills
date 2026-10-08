// A command line split the way the shell splits it. A word that names a tool asks, unless the guard can tell it is text or a read.
// An unknown form then costs one question, not a missed call.
// ponytail: no expansion or file reads. A program word from a variable, such as `$KUBECTL delete`, and a script file, such as `bash deploy.sh`, are not seen.

const TOOLS = new Set(['aws', 'aws-vault', 'kubectl', 'helm', 'terraform'])
// A tool's name inside a word, in any case, because macOS finds `Kubectl` too. Not inside a longer name, such as `kubectl-prod` or `AWS_PROFILE`.
const TOOL_NAME = new RegExp(`(^|[^A-Za-z0-9_-])(${[...TOOLS].join('|')})(?![A-Za-z_-])`, 'i')
const TERRAFORM_WRITES = new Set(['apply', 'destroy'])
// These programs never run the words they are given or the text they read.
const TEXT_ONLY = new Set(['echo', 'printf', 'grep', 'rg', 'cat', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'tr', 'jq', 'tee', 'less', 'which', 'type'])
// `git` and `gh` are text-only until one of these words makes them run a command, as `git rebase -x` and `gh alias set --shell` do.
const GIT_RUNS_A_COMMAND = new Set(['-c', '-x', '--exec', 'bisect', 'alias', 'extension', 'ext'])

const AWS_READ_OPERATION = /^(get|describe|list)-/
const AWS_CREDENTIAL_OPERATION = /^get-(secret-value|login-password|session-token|federation-token|token|authorization-token|credentials|.*-credentials)$/
const KUBECTL_READ_VERBS = new Set(['get', 'describe', 'logs', 'top', 'explain', 'api-resources', 'api-versions', 'version'])
const KUBECTL_READ_CONFIG = new Set(['get-contexts', 'current-context'])
const HELM_READ_VERBS = new Set(['list', 'ls', 'status', 'history'])

// `command -v kubectl` names a command and runs nothing.
const LOOKUP_FLAGS = new Set(['-v', '-V'])

// A reserved word before a command, as in `if grep kubectl …` or `do echo kubectl …`.
const RESERVED_PREFIXES = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{'])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/
const REDIRECTION = /^(&>>|&>|<<<|<<-|<<|<&|>&|>>|>\||<>|<|>)/
const SEPARATORS = new Set([';', '&', '(', ')'])
const BLANKS = new Set([' ', '\t'])
const WHITESPACE = /\s/
// The escapes of `$'…'`, such as `\x6b`, `k`, `\153`, and `\n`.
const ANSI_C_ESCAPE = /\\(x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{1,4}|U[0-9A-Fa-f]{1,8}|[0-7]{1,3}|[\s\S])/g
const ANSI_C_CHARACTERS: Record<string, string> = { n: '\n', t: '\t', r: '\r' }
const SUBSTITUTION = '$(…)'

// A simple command: its words, the text it reads from a heredoc or a here-string, the scripts of its substitutions, and whether a pipe feeds it.
type Command = { words: string[]; input: string[]; substitutions: string[]; readsPipe: boolean }
type Heredoc = { delimiter: string; isQuoted: boolean; command: Command }

const basename = (word: string) => word.slice(word.lastIndexOf('/') + 1)
const endOf = (index: number, text: string) => (index < 0 ? text.length : index)
const isTool = (word: string) => TOOLS.has(basename(word).toLowerCase())

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

// The index of the `}` that closes the `${` before `from`. A `}` in quotes or in a substitution does not.
function closingBrace(text: string, from: number) {
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') i++
    else if (c === "'") i = endOf(text.indexOf("'", i + 1), text)
    else if (c === '"') i = closingQuote(text, i + 1)
    else if (text.startsWith('$(', i)) i = closingParen(text, i + 2)
    else if (text.startsWith('${', i)) i = closingBrace(text, i + 2)
    else if (c === '}') return i
  }
  return text.length
}

// The index of the `mark` that closes a string, as for a backtick or `$'…'`. A backslash escapes the next character.
function closingMark(text: string, from: number, mark: string) {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === mark) return i
  }
  return text.length
}

function decodeAnsiC(_escape: string, code: string) {
  if (/^[xuU]/.test(code)) {
    const point = parseInt(code.slice(1), 16)
    return point <= 0x10ffff ? String.fromCodePoint(point) : ''
  }
  if (/^[0-7]/.test(code)) return String.fromCharCode(parseInt(code, 8))
  return ANSI_C_CHARACTERS[code] ?? code
}

// A double-quoted string's text. A substitution in it runs, so its script goes to `runs`.
function doubleQuoted(inner: string, runs: (script: string) => void) {
  let text = ''
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i] ?? ''
    if (c === '\\') text += inner[++i] ?? ''
    else if (inner.startsWith('$(', i)) {
      const end = closingParen(inner, i + 2)
      runs(inner.slice(i + 2, end))
      text += SUBSTITUTION
      i = end
    } else if (c === '`') {
      const end = closingMark(inner, i + 1, '`')
      runs(inner.slice(i + 1, end))
      text += SUBSTITUTION
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
    let isClosed = false
    while (i < text.length && !isClosed) {
      const end = endOf(text.indexOf('\n', i), text)
      const line = text.slice(i, end)
      i = end + 1
      if (line.replace(/^\t+/, '') === delimiter) isClosed = true
      else lines.push(line)
    }
    const body = lines.join('\n')
    const runs = (script: string) => {
      nested.push(script)
      command.substitutions.push(script)
    }
    command.input.push(isQuoted ? body : doubleQuoted(body, runs))
    // A `<<` that never closes may be a shift, as in `$[1<<2]`. Then the lines after it are commands.
    if (!isClosed) nested.push(body)
  }
  return i
}

function splitScript(text: string) {
  const commands: Command[] = []
  const nested: string[] = []
  const newCommand = (readsPipe: boolean): Command => ({ words: [], input: [], substitutions: [], readsPipe })
  let command = newCommand(false)
  let word = ''
  let hasWord = false
  let isQuoted = false
  // The operator whose target the next word is. A file name target is dropped.
  let redirection: string | undefined
  let heredocs: Heredoc[] = []
  const runs = (script: string) => {
    nested.push(script)
    command.substitutions.push(script)
  }
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
  // A command with no words yet, as after `|` and a line break, keeps waiting for its words.
  const endCommand = (readsPipe = false) => {
    endWord()
    redirection = undefined
    if (command.words.length === 0) {
      command.readsPipe ||= readsPipe
      return
    }
    commands.push(command)
    command = newCommand(readsPipe)
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
    } else if (text.startsWith("$'", i)) {
      const end = closingMark(text, i + 2, "'")
      word += text.slice(i + 2, end).replace(ANSI_C_ESCAPE, decodeAnsiC)
      hasWord = true
      isQuoted = true
      i = end + 1
    } else if (text.startsWith('$"', i)) {
      i++
    } else if (c === "'") {
      const end = endOf(text.indexOf("'", i + 1), text)
      word += text.slice(i + 1, end)
      hasWord = true
      isQuoted = true
      i = end + 1
    } else if (c === '"') {
      const end = closingQuote(text, i + 1)
      word += doubleQuoted(text.slice(i + 1, end), runs)
      hasWord = true
      isQuoted = true
      i = end + 1
    } else if (text.startsWith('$(', i) || text.startsWith('<(', i) || text.startsWith('>(', i)) {
      const end = closingParen(text, i + 2)
      runs(text.slice(i + 2, end))
      word += SUBSTITUTION
      hasWord = true
      i = end + 1
    } else if (c === '`') {
      const end = closingMark(text, i + 1, '`')
      runs(text.slice(i + 1, end))
      word += SUBSTITUTION
      hasWord = true
      i = end + 1
    } else if (text.startsWith('${', i)) {
      const end = closingBrace(text, i + 2)
      word += doubleQuoted(text.slice(i, end + 1), runs)
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
    } else if (text.startsWith('||', i)) {
      endCommand()
      i += 2
    } else if (c === '|') {
      endCommand(true)
      i += text[i + 1] === '&' ? 2 : 1
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

function isTextOnly(command: Command) {
  const [program = '', ...args] = programWords(command.words)
  const name = basename(program)
  if (name === 'command') return LOOKUP_FLAGS.has(args[0] ?? '')
  if (name === 'git' || name === 'gh') return !args.some(arg => GIT_RUNS_A_COMMAND.has(arg))
  return TEXT_ONLY.has(name)
}

const namesTool = (command: Command) => [...command.words, ...command.input].some(text => TOOL_NAME.test(text))

// A text-only program in the script writes a tool's name, as `cat <<'EOF'` does with `kubectl delete` in its body.
function writesToolText(script: string): boolean {
  const { commands, nested } = splitScript(script)
  return commands.some(each => isTextOnly(each) && namesTool(each)) || nested.some(writesToolText)
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
  return isReadOnly(basename(program).toLowerCase(), args) ? [] : [words.join(' ')]
}

function privilegedCallsIn(command: Command, script: string): string[] {
  if (isTextOnly(command)) return []
  const run = programWords(command.words)
  // Text that a text-only program writes runs here, as in `bash -c "$(cat <<'EOF' …)"` or `source <(echo …)`.
  if (run.length && command.substitutions.some(writesToolText)) return [run.join(' ')]
  // Any other program can run a word it is given, as `sudo`, `xargs`, `find -exec`, and `watch` do.
  const calls = command.input.flatMap(privilegedCalls)
  for (const [i, word] of run.entries()) {
    if (!TOOL_NAME.test(word)) continue
    // A word with a blank in it is a script, as in `sh -c '…'`. A word that splits into itself is not.
    if (WHITESPACE.test(word) && word !== script) calls.push(...privilegedCalls(word))
    else if (!isTool(word)) return [...calls, run.join(' ')]
    else {
      const call = toolCall(run.slice(i))
      // A read ends the scan only where the tool is the program. Elsewhere a later word can run too, as a second `find -exec` does.
      if (call.length || i === 0) return [...calls, ...call]
    }
  }
  return calls
}

// Each call of a privileged tool in the command that is not a read, as written from the tool's word on.
export function privilegedCalls(command: string): string[] {
  const { commands, nested } = splitScript(command)
  const calls = [...commands.flatMap(each => privilegedCallsIn(each, command)), ...nested.flatMap(privilegedCalls)]
  // Text that a text-only program writes runs in a program that reads it from a pipe, as in `echo '…' | sh`.
  const reader = commands.find(each => each.readsPipe && !isTextOnly(each))
  if (reader && writesToolText(command)) calls.push(reader.words.join(' '))
  return calls
}
