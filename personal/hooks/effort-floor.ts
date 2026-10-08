import type { Register } from 'claude-code'

type Level = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const ORDER: readonly Level[] = ['low', 'medium', 'high', 'xhigh', 'max']

// The minimum level for each skill, keyed by the skill name without its plugin prefix.
const FLOORS: Record<string, Level> = {
  grilling: 'high',
}

// skill.prompt does not say which loop loaded the skill, so the floor holds for the whole session.
let floor: Level | undefined

const rank = (level: Level) => ORDER.indexOf(level)

export const register: Register = (on) => {
  on('session.end', async ($, e, next) => {
    floor = undefined
    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    const min = FLOORS[e.skill.split(':').pop() ?? '']
    if (min && (!floor || rank(min) > rank(floor))) floor = min
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const low = floor && typeof e.effort === 'string' && rank(e.effort) < rank(floor)
    return yield* next(low ? { ...e, effort: floor } : e)
  })
}
