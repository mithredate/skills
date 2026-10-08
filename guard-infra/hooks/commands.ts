// A command line split the way the shell splits it, so a tool's name counts only where the shell runs it.
// ponytail: no expansion. A program word built from a variable or a substitution, such as `$KUBECTL delete`, is not seen.

const PRIVILEGED = new Set(['aws', 'aws-vault', 'kubectl', 'helm'])
const TERRAFORM_WRITES = new Set(['apply', 'destroy'])
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])

const AWS_READ_OPERATION = /^(get|describe|list)-/
const AWS_CREDENTIAL_OPERATION = /^get-(secret-value|login-password|session-token|federation-token|token|authorization-token|credentials|.*-credentials)$/
const KUBECTL_READ_VERBS = new Set(['get', 'describe', 'logs', 'top', 'explain', 'api-resources', 'api-versions', 'version'])
const KUBECTL_READ_CONFIG = new Set(['get-contexts', 'current-context'])
const HELM_READ_VERBS = new Set(['list', 'ls', 'status', 'history'])

// A wrapper runs the command after its own options. `flagsWithValue` take the next word, and `positionals` words come before the command.
type Wrapper = { flagsWithValue: Set<string>; positionals: number }
const WRAPPERS: Record<string, Wrapper> = {
  env: { flagsWithValue: new Set(['-u', '-C']), positionals: 0 },
  sudo: { flagsWithValue: new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-U', '-T']), positionals: 0 },
  doas: { flagsWithValue: new Set(['-u', '-C']), positionals: 0 },
  command: { flagsWithValue: new Set(), positionals: 0 },
  exec: { flagsWithValue: new Set(['-a']), positionals: 0 },
  nohup: { flagsWithValue: new Set(), positionals: 0 },
  nice: { flagsWithValue: new Set(['-n']), positionals: 0 },
  time: { flagsWithValue: new Set(['-f', '-o']), positionals: 0 },
  timeout: { flagsWithValue: new Set(['-s', '-k']), positionals: 1 },
  xargs: { flagsWithValue: new Set(['-n', '-I', '-P', '-L', '-d', '-E', '-s', '-a']), positionals: 0 },
  watch: { flagsWithValue: new Set(['-n']), positionals: 0 },
}
// `command -v kubectl` names a command and runs nothing.
const LOOKUP_FLAGS = new Set(['-v', '-V'])

// A reserved word before a command, as in `if kubectl …` or `do kubectl …`.
const RESERVED_PREFIXES = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{'])
// A command that starts with one of these runs none of its words, as in `for c in 'kubectl delete'`.
const NO_COMMAND = new Set(['for', 'case', 'select', 'function', 'fi', 'done', 'esac', '}', 'in'])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/
const REDIRECTION = /^(&>>|&>|<<<|<<-|<<|<&|>&|>>|>\||<>|<|>)/
const SEPARATORS = new Set([';', '&', '|', '(', ')'])
const BLANKS = new Set([' ', '\t'])

type Script = { commands: string[][]; nested: string[] }

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

// The word a redirection points at, with its quotes taken off, and the index after it.
function redirectionTarget(text: string, from: number) {
  let i = from
  while (BLANKS.has(text[i] ?? '')) i++
  let word = ''
  while (i < text.length && !BLANKS.has(text[i] ?? '') && !SEPARATORS.has(text[i] ?? '') && text[i] !== '\n') {
    const c = text[i] ?? ''
    if (c === "'" || c === '"') {
      const end = endOf(text.indexOf(c, i + 1), text)
      word += text.slice(i + 1, end)
      i = end + 1
    } else {
      word += c
      i++
    }
  }
  return { word, end: i }
}

// The index after the bodies of the heredocs that the line before `from` opened.
function skipHeredocs(text: string, from: number, delimiters: string[]) {
  let i = from
  for (const delimiter of delimiters) {
    while (i < text.length) {
      const end = endOf(text.indexOf('\n', i), text)
      const line = text.slice(i, end).replace(/^\t+/, '')
      i = end + 1
      if (line === delimiter) break
    }
  }
  return i
}

export function splitScript(text: string): Script {
  const commands: string[][] = []
  const nested: string[] = []
  let words: string[] = []
  let word = ''
  let hasWord = false
  let heredocs: string[] = []
  const endWord = () => {
    if (hasWord) words.push(word)
    word = ''
    hasWord = false
  }
  const endCommand = () => {
    endWord()
    if (words.length) commands.push(words)
    words = []
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
      }
      i += 2
    } else if (c === "'") {
      const end = endOf(text.indexOf("'", i + 1), text)
      word += text.slice(i + 1, end)
      hasWord = true
      i = end + 1
    } else if (c === '"') {
      const end = closingQuote(text, i + 1)
      word += doubleQuoted(text.slice(i + 1, end), nested)
      hasWord = true
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
      const end = endOf(text.indexOf('}', i), text)
      word += text.slice(i, end + 1)
      hasWord = true
      i = end + 1
    } else if (c === '#' && !hasWord) {
      i = endOf(text.indexOf('\n', i), text)
    } else if (c === '\n') {
      endCommand()
      i = skipHeredocs(text, i + 1, heredocs)
      heredocs = []
    } else if (BLANKS.has(c)) {
      endWord()
      i++
    } else if (c === '<' || c === '>' || (c === '&' && text[i + 1] === '>')) {
      // A file descriptor number before the operator belongs to the redirection, as in `2>&1`.
      if (/^\d+$/.test(word)) {
        word = ''
        hasWord = false
      } else endWord()
      const operator = REDIRECTION.exec(text.slice(i))?.[0] ?? c
      const target = redirectionTarget(text, i + operator.length)
      if (operator === '<<' || operator === '<<-') heredocs.push(target.word)
      i = target.end
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

// The words from the program on, after reserved words, assignments, and wrappers. Undefined when the command runs nothing.
function commandWords(words: string[]) {
  let i = 0
  while (RESERVED_PREFIXES.has(words[i] ?? '')) i++
  if (NO_COMMAND.has(words[i] ?? '')) return undefined
  for (;;) {
    while (ASSIGNMENT.test(words[i] ?? '')) i++
    const name = basename(words[i] ?? '')
    const wrapper = WRAPPERS[name]
    if (!wrapper) break
    i++
    let positionals = wrapper.positionals
    while (i < words.length) {
      const word = words[i] ?? ''
      if (word === '--') {
        i++
        break
      }
      if (name === 'command' && LOOKUP_FLAGS.has(word)) return undefined
      if (word.startsWith('-')) i += wrapper.flagsWithValue.has(word) ? 2 : 1
      else if (ASSIGNMENT.test(word) || positionals-- > 0) i++
      else break
    }
  }
  return i < words.length ? words.slice(i) : undefined
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
  return false
}

// The script a shell runs with `-c`, as in `sh -c '…'` or `bash -lc "…"`.
function shellScript(args: string[]) {
  const flag = args.findIndex(arg => /^-[A-Za-z]*c[A-Za-z]*$/.test(arg))
  return flag < 0 ? undefined : args[flag + 1]
}

function privilegedCallsIn(words: string[]): string[] {
  const command = commandWords(words)
  if (!command) return []
  const [program = '', ...args] = command
  const name = basename(program)
  if (SHELLS.has(name)) {
    const script = shellScript(args)
    return script === undefined ? [] : privilegedCalls(script)
  }
  if (name === 'eval') return privilegedCalls(args.join(' '))
  if (name === 'terraform') return TERRAFORM_WRITES.has(positionalArgs(args)[0] ?? '') ? [command.join(' ')] : []
  return PRIVILEGED.has(name) && !isReadOnly(name, args) ? [command.join(' ')] : []
}

// Each call of a privileged tool in the command that is not a read, as written from its program word on.
export function privilegedCalls(command: string): string[] {
  const { commands, nested } = splitScript(command)
  return [...commands.flatMap(privilegedCallsIn), ...nested.flatMap(privilegedCalls)]
}
