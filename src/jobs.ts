/**
 * Background jobs, run by AppJobRoom (worker.ts) as the app owner.
 *
 * generate-quiz: read the host's uploaded notes from R2, ask Claude for
 * structured questions, validate them, and write them to `questions`.
 * Progress streams to the host's screen through `useJobs`.
 */

import { appFiles, createDeepSpaceAI } from 'deepspace/worker'
import type { Job, JobContext } from 'deepspace/worker'
import { generateText, Output } from 'ai'
import type { Env } from '../worker'
import { createActionTools } from './server/action-routes'
import {
  buildGenerationPrompt,
  generatedQuizSchema,
  MAX_SOURCE_BYTES,
  prepareSourceText,
  toQuestions,
  type GenerateQuizPayload,
  type Quiz,
} from './lib/quiz'

/** Balanced quality/speed for short structured output. */
const GENERATION_MODEL = 'claude-sonnet-5-5'
const GENERATION_TIMEOUT_MS = 120_000

export async function runJob(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  switch (job.type) {
    case 'generate-quiz':
      return generateQuiz(job as Job<GenerateQuizPayload>, ctx, env)
    default:
      throw new Error(`Unknown job type: ${job.type}`)
  }
}

async function generateQuiz(job: Job<GenerateQuizPayload>, ctx: JobContext, env: Env) {
  // Identity comes from `enqueuedBy`, which JobRoom sets from the verified
  // socket user (client enqueue) or from our createQuiz action. Never trust
  // a host id inside the payload.
  const hostId = job.enqueuedBy
  const quizId = job.payload?.quizId
  if (!hostId || !quizId) throw new Error('Job is missing its host or quiz.')

  const tools = createActionTools(env, hostId, '')
  const found = await tools.get('quizzes', quizId)
  if (!found.success) throw new Error('Quiz not found.')
  const quiz = found.data.record.data as unknown as Quiz
  if (quiz.hostId !== hostId) throw new Error('Quiz belongs to someone else.')

  const fail = async (message: string): Promise<never> => {
    await tools.update('quizzes', quizId, { status: 'failed', error: message })
    throw new Error(message)
  }

  try {
    await tools.update('quizzes', quizId, { status: 'generating', error: '' })
    ctx.progress(0.05, 'Reading your notes')

    if (!quiz.sourceKey) return await fail('No notes were uploaded.')
    const res = await appFiles(env, { scope: 'self', userId: hostId }).download(quiz.sourceKey)
    const bytes = await res.arrayBuffer()
    if (bytes.byteLength > MAX_SOURCE_BYTES) return await fail('Notes file is too large.')
    const { text, truncated } = prepareSourceText(new TextDecoder().decode(bytes))
    if (text.length < 200) return await fail('Notes are too short to make a quiz from.')

    const count = quiz.questionCount ?? 5
    ctx.progress(0.2, truncated ? 'Notes are long, using the first part' : 'Writing questions')

    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)])
    const anthropic = createDeepSpaceAI(env, 'anthropic')
    const result = await generateText({
      model: anthropic(GENERATION_MODEL),
      output: Output.object({ schema: generatedQuizSchema, name: 'quiz' }),
      prompt: buildGenerationPrompt(text, count),
      maxOutputTokens: 4000,
      abortSignal: signal,
    })
    if (ctx.signal.aborted) return

    // Output.object already validated against the schema; re-parse so a
    // provider quirk can never write malformed rows.
    const parsed = generatedQuizSchema.safeParse(result.output)
    if (!parsed.success) return await fail('The AI returned questions in the wrong shape. Try again.')
    const questions = toQuestions(parsed.data, quizId, hostId, count)
    ctx.progress(0.8, 'Saving questions')

    // Idempotent on retry: clear any rows a previous attempt left behind.
    await tools.deleteWhere('questions', { quizId })
    for (const q of questions) {
      const r = await tools.create('questions', q)
      if (!r.success) return await fail('Could not save questions.')
    }

    await tools.update('quizzes', quizId, { status: 'ready', questionCount: questions.length, error: '' })
    ctx.progress(1, 'Done')
    return { quizId, questionCount: questions.length }
  } catch (err) {
    if (ctx.signal.aborted) return
    const message = err instanceof Error ? err.message : 'Generation failed.'
    // `fail` already recorded its own message; record anything else.
    await tools.update('quizzes', quizId, { status: 'failed', error: message.slice(0, 500) })
    throw err
  }
}
