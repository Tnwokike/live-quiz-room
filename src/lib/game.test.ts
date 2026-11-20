import { describe, expect, it } from 'vitest'
import {
  ANSWER_GRACE_MS,
  isWithinDeadline,
  JOIN_CODE_LENGTH,
  makeJoinCode,
  normalizeJoinCode,
  rankPlayers,
  scoreAnswer,
  secondsLeft,
  tallyAnswers,
} from './game'

describe('scoreAnswer', () => {
  it('gives 0 for a wrong answer however fast', () => {
    expect(scoreAnswer(false, 0, 20_000, 20_000)).toBe(0)
  })
  it('gives 1000 for an instant correct answer and 500 at the buzzer', () => {
    expect(scoreAnswer(true, 0, 20_000, 20_000)).toBe(1000)
    expect(scoreAnswer(true, 20_000, 20_000, 20_000)).toBe(500)
  })
  it('scales linearly and clamps late (grace-period) answers to 500', () => {
    expect(scoreAnswer(true, 10_000, 20_000, 20_000)).toBe(750)
    expect(scoreAnswer(true, 20_500, 20_000, 20_000)).toBe(500)
  })
})

describe('isWithinDeadline', () => {
  const live = { phase: 'question' as const, questionEndsAt: 10_000 }
  it('accepts up to the grace window and rejects after', () => {
    expect(isWithinDeadline(live, 10_000 + ANSWER_GRACE_MS)).toBe(true)
    expect(isWithinDeadline(live, 10_001 + ANSWER_GRACE_MS)).toBe(false)
  })
  it('rejects when the question is not live', () => {
    expect(isWithinDeadline({ ...live, phase: 'reveal' }, 0)).toBe(false)
    expect(isWithinDeadline({ phase: 'question' }, 0)).toBe(false)
  })
})

describe('join codes', () => {
  it('are fixed length with no ambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = makeJoinCode()
      expect(code).toHaveLength(JOIN_CODE_LENGTH)
      expect(code).not.toMatch(/[01OIL]/)
    }
  })
  it('normalize user input', () => {
    expect(normalizeJoinCode(' ab-c d2 3x9 ')).toBe('ABCD23')
  })
})

it('tallyAnswers counts per option and ignores out-of-range choices', () => {
  expect(tallyAnswers([0, 2, 2, 3, 7, -1])).toEqual([1, 0, 2, 1])
})

it('rankPlayers sorts by score then name', () => {
  const ranked = rankPlayers([
    { name: 'Bo', score: 500 },
    { name: 'Al', score: 900 },
    { name: 'Ann', score: 500 },
  ])
  expect(ranked.map((p) => p.name)).toEqual(['Al', 'Ann', 'Bo'])
})

it('secondsLeft applies the server clock offset', () => {
  // Client clock is 2s behind the server: offset +2000.
  expect(secondsLeft(20_000, 2_000, 8_000)).toBe(10)
  expect(secondsLeft(20_000, 0, 30_000)).toBe(0)
})
