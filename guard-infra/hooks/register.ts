import type { Register } from 'claude-code'
import { leavesSandbox, privilegedCalls } from './commands.js'

const HEADER = 'Privileged'
const RUN = 'Run'
const CANCEL = 'Cancel'

type Sandbox = { enabled?: boolean; failIfUnavailable?: boolean; allowUnsandboxedCommands?: boolean; excludedCommands?: string[] }

// A sandboxed call reaches neither AWS nor EKS, so a question about it protects nothing.
// Without `failIfUnavailable`, Claude Code runs every call unsandboxed when the sandbox cannot start.
function staysInSandbox(sandbox: Sandbox | undefined, command: string, asksToLeave = false) {
  if (!sandbox?.enabled || !sandbox.failIfUnavailable) return false
  if (asksToLeave && sandbox.allowUnsandboxedCommands !== false) return false
  return !leavesSandbox(command, sandbox.excludedCommands ?? [])
}

export const register: Register = on => {
  // A privileged call that is not a read runs only after the user presses Run. Every other answer refuses it.
  // The question dialog always reaches the user. A permission `ask` would go to the mode's decider, which auto mode is.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (privilegedCalls(e.command).length === 0) return next(e)
    const sandbox = (await $.settings.read({ key: 'sandbox' })) as Sandbox | undefined
    if (staysInSandbox(sandbox, e.command, e.dangerouslyDisableSandbox)) return next(e)
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
