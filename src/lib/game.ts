/**
 * Live game types and pure rules — shared by server actions and the UI.
 * Everything time-based takes `now` as an argument so it is testable.
 */

import { OPTIONS_PER_QUESTION } from './quiz'

export const QUESTION_DURATION_MS = 20_000
/** Answers that arrive this long after the deadline still count (network slack). */
export const ANSWER_GRACE_MS = 750
export const MAX_POINTS = 1000
export const BASE_POINTS = 500

export type GamePhase = 'lobby' | 'question' | 'reveal' | 'finished'

/** What players may see of a question: no answer key. */
export type PublicQuestion = { prompt: string; options: string[] }

export type Game = {
  quizId: string
  hostId: string
  title?: string
  joinCode: string
  phase: GamePhase
  currentIndex: number
  totalQuestions: number
  currentQuestion?: PublicQuestion | null
  questionEndsAt?: number
  questionDurationMs?: number
  revealedIndex: number
  answeredCount: number
  /** Per-option answer counts for the revealed question. */
  answerCounts?: number[] | null
  playerIds: string[]
}

export type Player = { gameId: string; userId: string; name: string; score: number; lastPoints: number }

export type Answer = {
  gameId: string
  questionIndex: number
  userId: string
  choice: number
  answeredAt: number
  points?: number
}

/** No 0/O/1/I/L — codes get read aloud and typed on phones. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const JOIN_CODE_LENGTH = 6

export function makeJoinCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  return code
}

export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, JOIN_CODE_LENGTH)
}

/** Can an answer stamped `now` still be accepted for the live question? */
export function isWithinDeadline(game: Pick<Game, 'phase' | 'questionEndsAt'>, now: number): boolean {
  return game.phase === 'question' && typeof game.questionEndsAt === 'number' && now <= game.questionEndsAt + ANSWER_GRACE_MS
}

/**
 * Correct answers earn BASE_POINTS plus up to (MAX_POINTS - BASE_POINTS) for
 * speed, scaled by the fraction of time left. Wrong answers earn 0.
 */
export function scoreAnswer(correct: boolean, answeredAt: number, endsAt: number, durationMs: number): number {
  if (!correct) return 0
  const left = Math.min(Math.max(endsAt - answeredAt, 0), durationMs)
  return Math.round(BASE_POINTS + (MAX_POINTS - BASE_POINTS) * (left / durationMs))
}

export function tallyAnswers(choices: number[]): number[] {
  const counts = new Array<number>(OPTIONS_PER_QUESTION).fill(0)
  for (const c of choices) if (c >= 0 && c < OPTIONS_PER_QUESTION) counts[c]++
  return counts
}

/** Leaderboard order: score desc, then name for a stable tie order. */
export function rankPlayers<T extends { score: number; name: string }>(players: T[]): T[] {
  return [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

/** Seconds left on the live question, using a server-clock offset (serverNow - clientNow). */
export function secondsLeft(endsAt: number | undefined, clockOffsetMs: number, clientNow = Date.now()): number {
  if (!endsAt) return 0
  return Math.max(0, Math.ceil((endsAt - (clientNow + clockOffsetMs)) / 1000))
}
