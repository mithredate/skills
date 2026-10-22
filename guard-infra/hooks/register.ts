import type { Register } from 'claude-code'
import { leavesSandbox, privilegedCalls } from './commands.js'

const HEADER = 'Privileged'
const RUN = 'Run'
const CANCEL = 'Cancel'

type Credential = { path?: string; name?: string; mode?: string }
type Sandbox = {
  enabled?: boolean
  failIfUnavailable?: boolean
  allowUnsandboxedCommands?: boolean
  excludedCommands?: string[]
  network?: { deniedDomains?: string[] }
  credentials?: { files?: Credential[]; envVars?: Credential[] }
}
type BashCall = { command: string; dangerouslyDisableSandbox?: boolean; allowed_domains?: string[] }

// The credentials that `guard-infra/sandbox.json` hides from a sandboxed call.
const HIDDEN_FILES = ['~/.aws', '~/.kube']
const HIDDEN_VARIABLES = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']
// The API host suffixes of every public AWS partition. The deny list keeps a key from a `.env` file off AWS.
const DENIED_HOSTS = ['*.amazonaws.com', '*.amazonaws.com.cn', '*.api.aws', '*.api.amazonwebservices.com.cn', '*.amazonaws.eu', '*.api.amazonwebservices.eu']

// Settings layers merge the lists, so a `mask` entry from another layer can stand beside the `deny` entry.
const denies = (entries: Credential[] | undefined, key: 'path' | 'name', names: string[]) =>
  names.every(name => {
    const modes = (entries ?? []).filter(entry => entry[key] === name).map(entry => entry.mode)
    return modes.length > 0 && modes.every(mode => mode === 'deny')
  })

// A sandboxed call without the credentials cannot change AWS or EKS, so a question about it protects nothing.
// Without `failIfUnavailable`, Claude Code runs every call unsandboxed when the sandbox cannot start.
// A host in `allowed_domains` opens the network to a call that can find a key elsewhere, such as in a `.env` file.
function staysInSandbox(sandbox: Sandbox | undefined, call: BashCall) {
  if (!sandbox?.enabled || !sandbox.failIfUnavailable) return false
  if (!denies(sandbox.credentials?.files, 'path', HIDDEN_FILES)) return false
  if (!denies(sandbox.credentials?.envVars, 'name', HIDDEN_VARIABLES)) return false
  if (!DENIED_HOSTS.every(host => sandbox.network?.deniedDomains?.includes(host))) return false
  if (call.allowed_domains?.length) return false
  if (call.dangerouslyDisableSandbox && sandbox.allowUnsandboxedCommands !== false) return false
  return !leavesSandbox(call.command, sandbox.excludedCommands ?? [])
}

export const register: Register = on => {
  // A privileged call that is not a read runs only after the user presses Run. Every other answer refuses it.
  // The question dialog always reaches the user. A permission `ask` would go to the mode's decider, which auto mode is.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (privilegedCalls(e.command).length === 0) return next(e)
    // A failed read asks, as with no sandbox, so the user can still run the call.
    const sandbox = (await $.settings.read({ key: 'sandbox' }).catch(() => undefined)) as Sandbox | undefined
    if (staysInSandbox(sandbox, e)) return next(e)
    let answer: string
    try {
      answer = await $.ui.ask(`Run this privileged command?\n\n${e.command}`, { header: HEADER, options: [RUN, CANCEL] })
    } catch {
      return {
        deny:
          `guard-infra: no one answered the question, so \`${e.command}\` did not run. ` +
          'Hand the user the exact command in a code block to run themselves.',
      }
    }
    if (answer === RUN) return next(e)
    if (answer === CANCEL) {
      return { deny: `guard-infra: the user cancelled \`${e.command}\`. Do not run it again. Ask the user how to go on.` }
    }
    return { deny: `guard-infra: the user did not run \`${e.command}\`, and wrote: ${answer}` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'guard-infra failed, so the privileged command did not run. Retry it.' }))
}
