/**
 * Server actions. They run RBAC-off (see src/server/action-routes.ts), so
 * each one validates its own input and checks ownership before writing.
 */

import { enqueueJob } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { hostJobRoomId, QUESTION_COUNTS, type GenerateQuizPayload, type Quiz } from '../lib/quiz'
import { endGame, joinGame, nextQuestion, revealQuestion, serverTime, startGame, submitAnswer } from './game'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * Create a quiz record for the caller and queue its AI generation.
 *
 * Why an action and not a client `create` + `useJobs().enqueue`: the job
 * spends the app owner's AI credits and reads the host's private file, so
 * the worker decides who the host is (the verified caller) and stamps it on
 * both the record and the job's `enqueuedBy`.
 */
const createQuiz: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const title = str(params.title).slice(0, 120)
  const sourceKey = str(params.sourceKey)
  const sourceName = str(params.sourceName).slice(0, 200)
  const questionCount = Number(params.questionCount)

  if (!title) return { success: false, error: 'Give the quiz a title.' }
  if (!sourceKey) return { success: false, error: 'Upload notes first.' }
  // The job downloads this key as the host (appFiles with scope 'self'), and
  // the platform refuses any key outside that user's scope ("key outside
  // scope"), so a forged key can't reach someone else's file. Still reject
  // path tricks up front.
  if (sourceKey.includes('..') || sourceKey.startsWith('/')) {
    return { success: false, error: 'Invalid file key.' }
  }
  if (!(QUESTION_COUNTS as readonly number[]).includes(questionCount)) {
    return { success: false, error: `Question count must be one of ${QUESTION_COUNTS.join(', ')}.` }
  }

  const quiz: Quiz = { hostId: userId, title, sourceKey, sourceName, questionCount, status: 'generating' }
  const created = await tools.create('quizzes', quiz)
  if (!created.success) return created
  const quizId = created.data.recordId

  try {
    const payload: GenerateQuizPayload = { quizId }
    const jobId = await enqueueJob(env.JOB_ROOMS, hostJobRoomId(userId), 'generate-quiz', payload, {
      maxAttempts: 2,
      enqueuedBy: userId,
    })
    await tools.update('quizzes', quizId, { jobId })
    return { success: true, data: { quizId, jobId } }
  } catch (err) {
    await tools.update('quizzes', quizId, { status: 'failed', error: 'Could not queue generation.' })
    return { success: false, error: err instanceof Error ? err.message : 'Could not queue generation.' }
  }
}

export const actions: Record<string, ActionHandler<Env>> = {
  createQuiz,
  startGame,
  joinGame,
  nextQuestion,
  submitAnswer,
  revealQuestion,
  endGame,
  serverTime,
}
