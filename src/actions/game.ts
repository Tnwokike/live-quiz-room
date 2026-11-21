/**
 * Live game server actions. Members can't write `games`, `players` or
 * `answers` directly (see quiz-schemas.ts), so these are the only way game
 * state changes. Each one checks who the caller is before writing.
 *
 * Concurrency notes (the record room has no multi-row transactions):
 *  - `players` rows are the source of truth for who joined (uniqueOn
 *    gameId+userId). `games.playerIds` is a derived copy for the `shared`
 *    read rule; it's recomputed from `players` on join and on every host
 *    action, so a lost update from two simultaneous joins heals itself.
 *  - Scores are recomputed as the sum of a player's answer points, never
 *    incremented, so a double-clicked reveal can't double-score.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  isWithinDeadline,
  makeJoinCode,
  normalizeJoinCode,
  QUESTION_DURATION_MS,
  scoreAnswer,
  tallyAnswers,
  type Answer,
  type Game,
  type Player,
} from '../lib/game'
import { OPTIONS_PER_QUESTION, type Question, type Quiz } from '../lib/quiz'

type Row<T> = { recordId: string; data: T }
const fail = (error: string): ActionResult<never> => ({ success: false, error })

async function getRow<T>(tools: ActionTools, coll: string, id: string): Promise<Row<T> | null> {
  if (!id) return null
  const r = await tools.get(coll, id)
  if (!r.success) return null
  const rec = r.data.record as unknown as Row<T>
  return { recordId: rec.recordId ?? id, data: rec.data }
}

/**
 * Query every matching row, following `nextOffset`. A single records.query
 * page is capped (~30KB, then truncated with a `nextOffset`), so reading only
 * the first page would silently drop answers in a big game and corrupt scores.
 * `max` bounds the total for lookups that only need one row.
 */
async function queryRows<T>(tools: ActionTools, coll: string, where: Record<string, string | number>, max = 10_000) {
  const rows: Row<T>[] = []
  let offset: number | undefined = 0
  while (offset !== undefined && rows.length < max) {
    const r = await tools.query(coll, { where, limit: Math.min(200, max - rows.length), offset } as Parameters<ActionTools['query']>[1])
    if (!r.success) throw new Error(r.error)
    const page = r.data as { records: unknown[]; nextOffset?: number }
    rows.push(...(page.records as Row<T>[]))
    offset = page.nextOffset
  }
  return rows
}

/** Load a game the caller hosts, or explain why not. */
async function hostedGame(tools: ActionTools, gameId: string, userId: string) {
  const game = await getRow<Game>(tools, 'games', gameId)
  if (!game) return { error: 'Game not found.' } as const
  if (game.data.hostId !== userId) return { error: 'Only the host can do that.' } as const
  return { game } as const
}

async function syncPlayerIds(tools: ActionTools, gameId: string): Promise<string[]> {
  const players = await queryRows<Player>(tools, 'players', { gameId })
  const ids = [...new Set(players.map((p) => p.data.userId))]
  await tools.update('games', gameId, { playerIds: ids })
  return ids
}

async function displayName(tools: ActionTools, userId: string, fallback: string): Promise<string> {
  // Use the server-side profile name rather than trusting a client-sent one.
  const user = await getRow<{ name?: string }>(tools, 'users', userId)
  return (user?.data.name || fallback || 'Player').slice(0, 60)
}

/** Host opens a lobby for one of their ready quizzes. */
export const startGame: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const quiz = await getRow<Quiz>(tools, 'quizzes', String(params.quizId ?? ''))
  if (!quiz || quiz.data.hostId !== userId) return fail('Quiz not found.')
  if (quiz.data.status !== 'ready') return fail('This quiz is not ready yet.')
  const questions = await queryRows<Question>(tools, 'questions', { quizId: quiz.recordId })
  if (questions.length === 0) return fail('This quiz has no questions.')

  // uniqueOn joinCode rejects a collision; retry with a fresh code.
  for (let attempt = 0; attempt < 5; attempt++) {
    const game: Game = {
      quizId: quiz.recordId,
      hostId: userId,
      title: quiz.data.title,
      joinCode: makeJoinCode(),
      phase: 'lobby',
      currentIndex: -1,
      totalQuestions: questions.length,
      currentQuestion: null,
      revealedIndex: -1,
      answeredCount: 0,
      questionDurationMs: QUESTION_DURATION_MS,
      answerCounts: null,
      playerIds: [],
    }
    const created = await tools.create('games', game)
    if (created.success) return { success: true, data: { gameId: created.data.recordId, joinCode: game.joinCode } }
    if (!/duplicate/i.test(created.error)) return created
  }
  return fail('Could not create a join code. Try again.')
}

/** Player enters a code. Idempotent: rejoining returns the same game. */
export const joinGame: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const code = normalizeJoinCode(String(params.code ?? ''))
  if (!code) return fail('Enter a game code.')
  const [game] = await queryRows<Game>(tools, 'games', { joinCode: code }, 1)
  if (!game) return fail('No game with that code.')
  const serverNow = Date.now()
  if (game.data.hostId === userId) return { success: true, data: { gameId: game.recordId, role: 'host', serverNow } }
  if (game.data.phase === 'finished') return fail('That game has already finished.')

  const existing = await queryRows<Player>(tools, 'players', { gameId: game.recordId, userId }, 1)
  if (existing.length === 0) {
    const player: Player = {
      gameId: game.recordId,
      userId,
      name: await displayName(tools, userId, String(params.name ?? '')),
      score: 0,
      lastPoints: 0,
    }
    const created = await tools.create('players', player)
    // A duplicate means a parallel join from the same user won the race: fine.
    if (!created.success && !/duplicate/i.test(created.error)) return created
  }
  await syncPlayerIds(tools, game.recordId)
  return { success: true, data: { gameId: game.recordId, role: 'player', serverNow } }
}

/** Host shows the next question (or finishes after the last one). */
export const nextQuestion: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const r = await hostedGame(tools, String(params.gameId ?? ''), userId)
  if ('error' in r) return fail(r.error!)
  const { game } = r
  if (game.data.phase !== 'lobby' && game.data.phase !== 'reveal') return fail('Reveal the current question first.')

  await syncPlayerIds(tools, game.recordId)
  const next = game.data.currentIndex + 1
  if (next >= game.data.totalQuestions) {
    await tools.update('games', game.recordId, { phase: 'finished', currentQuestion: null })
    return { success: true, data: { phase: 'finished', serverNow: Date.now() } }
  }

  const [question] = await queryRows<Question>(tools, 'questions', { quizId: game.data.quizId, position: next }, 1)
  if (!question) return fail('Question missing.')
  const now = Date.now()
  const duration = game.data.questionDurationMs ?? QUESTION_DURATION_MS
  await tools.update('games', game.recordId, {
    phase: 'question',
    currentIndex: next,
    // Copy prompt + options only. correctIndex stays in host-only `questions`.
    currentQuestion: { prompt: question.data.prompt, options: question.data.options },
    questionEndsAt: now + duration,
    revealedIndex: -1,
    answeredCount: 0,
    answerCounts: null,
  })
  return { success: true, data: { phase: 'question', serverNow: now } }
}

/** Player answers the live question. The server stamps the time and enforces the deadline. */
export const submitAnswer: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const now = Date.now()
  const game = await getRow<Game>(tools, 'games', String(params.gameId ?? ''))
  if (!game) return fail('Game not found.')
  const choice = Number(params.choice)
  if (!Number.isInteger(choice) || choice < 0 || choice >= OPTIONS_PER_QUESTION) return fail('Invalid choice.')
  if (!isWithinDeadline(game.data, now)) return fail("Time's up for this question.")
  const joined = await queryRows<Player>(tools, 'players', { gameId: game.recordId, userId }, 1)
  if (joined.length === 0) return fail('Join the game first.')

  const answer: Answer = { gameId: game.recordId, questionIndex: game.data.currentIndex, userId, choice, answeredAt: now }
  const created = await tools.create('answers', answer)
  if (!created.success) return fail(/duplicate/i.test(created.error) ? 'You already answered.' : created.error)

  // Recount rather than increment so concurrent answers converge.
  const answers = await queryRows<Answer>(tools, 'answers', { gameId: game.recordId, questionIndex: game.data.currentIndex })
  await tools.update('games', game.recordId, { answeredCount: answers.length })
  return { success: true, data: { accepted: true } }
}

/**
 * Close the question: score answers, publish the correct option and counts.
 *
 * The host can reveal any time. A joined player can too, but only once the
 * deadline (plus grace) has passed on the server clock, so a host whose tab
 * stalled or closed can't leave everyone stuck at 0 seconds. Revealing early
 * stays host-only. Safe to call more than once (see scoring note at top).
 */
export const revealQuestion: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const game = await getRow<Game>(tools, 'games', String(params.gameId ?? ''))
  if (!game) return fail('Game not found.')
  if (game.data.phase === 'reveal') return { success: true, data: { alreadyRevealed: true } }
  if (game.data.phase !== 'question') return fail('No question is live.')
  if (game.data.hostId !== userId) {
    const joined = await queryRows<Player>(tools, 'players', { gameId: game.recordId, userId }, 1)
    if (joined.length === 0) return fail('Only the host can do that.')
    if (isWithinDeadline(game.data, Date.now())) return fail('Only the host can reveal early.')
  }

  const index = game.data.currentIndex
  const [question] = await queryRows<Question>(tools, 'questions', { quizId: game.data.quizId, position: index }, 1)
  if (!question) return fail('Question missing.')
  const correctIndex = question.data.correctIndex
  const endsAt = game.data.questionEndsAt ?? Date.now()
  const duration = game.data.questionDurationMs ?? QUESTION_DURATION_MS

  // Close answering first so late submits are refused while we score.
  await tools.update('games', game.recordId, { phase: 'reveal', revealedIndex: correctIndex })

  const answers = await queryRows<Answer>(tools, 'answers', { gameId: game.recordId, questionIndex: index })
  const pointsByUser = new Map<string, number>()
  for (const a of answers) {
    const points = scoreAnswer(a.data.choice === correctIndex, a.data.answeredAt, endsAt, duration)
    pointsByUser.set(a.data.userId, points)
    await tools.update('answers', a.recordId, { points })
  }

  // Score = sum of all this player's answer points in the game (idempotent).
  const allAnswers = await queryRows<Answer>(tools, 'answers', { gameId: game.recordId })
  const totals = new Map<string, number>()
  for (const a of allAnswers) totals.set(a.data.userId, (totals.get(a.data.userId) ?? 0) + (a.data.points ?? 0))
  const players = await queryRows<Player>(tools, 'players', { gameId: game.recordId })
  for (const p of players) {
    await tools.update('players', p.recordId, {
      score: totals.get(p.data.userId) ?? 0,
      lastPoints: pointsByUser.get(p.data.userId) ?? 0,
    })
  }

  await tools.update('games', game.recordId, {
    answerCounts: tallyAnswers(answers.map((a) => a.data.choice)),
    answeredCount: answers.length,
  })
  return { success: true, data: { correctIndex } }
}

/** Server clock, so countdowns line up with the deadline the server enforces. */
export const serverTime: ActionHandler<Env> = async () => ({ success: true, data: { now: Date.now() } })

/** Host ends the game early. */
export const endGame: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const r = await hostedGame(tools, String(params.gameId ?? ''), userId)
  if ('error' in r) return fail(r.error!)
  await tools.update('games', r.game.recordId, { phase: 'finished', currentQuestion: null })
  return { success: true, data: {} }
}
