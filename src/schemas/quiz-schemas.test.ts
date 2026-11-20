import { describe, expect, it } from 'vitest'
import { lintSchemas } from 'deepspace/worker'
import { schemas } from '../schemas'
import { answersSchema, gamesSchema, playersSchema, questionsSchema, quizzesSchema } from './quiz-schemas'

describe('quiz schemas', () => {
  it('pass the SDK schema linter with no warnings', () => {
    expect(lintSchemas(schemas)).toEqual([])
  })

  it('never let a member read another host\'s answer key', () => {
    expect(questionsSchema.permissions.member.read).toBe('own')
    expect(questionsSchema.ownerField).toBe('hostId')
    expect(questionsSchema.permissions['*'].read).toBe(false)
  })

  it('keep the answer key out of the shared games record', () => {
    const gameColumns = gamesSchema.columns.map((c) => c.name)
    expect(gameColumns).not.toContain('correctIndex')
    expect(gamesSchema.permissions.member.read).toBe('shared')
  })

  it('route every game-state write through server actions', () => {
    for (const s of [quizzesSchema, questionsSchema, gamesSchema, playersSchema, answersSchema]) {
      expect(s.permissions.member.create, s.name).toBe(false)
    }
    expect(gamesSchema.permissions.member.update).toBe(false)
    expect(playersSchema.permissions.member.update).toBe(false)
    expect(answersSchema.permissions.member.update).toBe(false)
  })

  it('allow one answer per player per question and one player row per game', () => {
    expect(answersSchema.uniqueOn).toEqual(['gameId', 'questionIndex', 'userId'])
    expect(playersSchema.uniqueOn).toEqual(['gameId', 'userId'])
  })
})
