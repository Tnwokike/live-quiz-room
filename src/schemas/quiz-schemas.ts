/**
 * Live Quiz Room — collection schemas.
 *
 * Security model in one sentence: players can never read correct answers
 * before the reveal, and every game-state change goes through a server action.
 *
 *   quizzes    host-only. Created by the `createQuiz` action, filled by a job.
 *   questions  host-only. The ONLY place `correctIndex` lives before reveal.
 *   games      readable by the host and joined players (`shared`). Holds the
 *              current question WITHOUT its answer. Written by actions only.
 *   players    one row per player per game (`uniqueOn`). Scores written by
 *              the `revealQuestion` action only.
 *   answers    one row per player per question (`uniqueOn`). Written by the
 *              `submitAnswer` action, which enforces the deadline server-side.
 *
 * Members get `create: false` on everything except through actions, so a
 * tampered client cannot invent a game, a score, or a late answer.
 */

import type { CollectionSchema } from 'deepspace/schema'

const ADMIN_ALL = { read: true, create: true, update: true, delete: true } as const
const NONE = { read: false, create: false, update: false, delete: false } as const

export const quizzesSchema: CollectionSchema = {
  name: 'quizzes',
  columns: [
    { name: 'hostId', storage: 'text', interpretation: 'plain', required: true, userBound: true, immutable: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: 120 },
    /** R2 key of the uploaded notes, in the host's private (`self`) scope. */
    { name: 'sourceKey', storage: 'text', interpretation: 'plain', maxLength: 512 },
    { name: 'sourceName', storage: 'text', interpretation: 'plain', maxLength: 200 },
    { name: 'questionCount', storage: 'number', interpretation: 'plain' },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['generating', 'ready', 'failed'] },
      required: true,
    },
    { name: 'jobId', storage: 'text', interpretation: 'plain' },
    { name: 'error', storage: 'text', interpretation: 'plain', maxLength: 500 },
  ],
  ownerField: 'hostId',
  permissions: {
    '*': NONE,
    viewer: NONE,
    // Hosts may rename or delete their own quiz; status/job fields are server-owned.
    member: { read: 'own', create: false, update: 'own', delete: 'own', writableFields: ['title'] },
    admin: ADMIN_ALL,
  },
}

export const questionsSchema: CollectionSchema = {
  name: 'questions',
  columns: [
    { name: 'quizId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'hostId', storage: 'text', interpretation: 'plain', required: true, userBound: true, immutable: true },
    { name: 'position', storage: 'number', interpretation: 'plain', required: true },
    { name: 'prompt', storage: 'text', interpretation: 'plain', required: true, maxLength: 500 },
    /** string[] — exactly four options. */
    { name: 'options', storage: 'text', interpretation: { kind: 'json' }, required: true },
    { name: 'correctIndex', storage: 'number', interpretation: 'plain', required: true },
    { name: 'explanation', storage: 'text', interpretation: 'plain', maxLength: 500 },
  ],
  ownerField: 'hostId',
  permissions: {
    '*': NONE,
    viewer: NONE,
    // Host can fix a bad question during review; only the job creates them.
    member: {
      read: 'own',
      create: false,
      update: 'own',
      delete: 'own',
      writableFields: ['prompt', 'options', 'correctIndex', 'explanation'],
    },
    admin: ADMIN_ALL,
  },
}

export const gamesSchema: CollectionSchema = {
  name: 'games',
  columns: [
    { name: 'quizId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'hostId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'title', storage: 'text', interpretation: 'plain', maxLength: 120 },
    { name: 'joinCode', storage: 'text', interpretation: 'plain', required: true, immutable: true, maxLength: 8 },
    {
      name: 'phase',
      storage: 'text',
      interpretation: { kind: 'select', options: ['lobby', 'question', 'reveal', 'finished'] },
      required: true,
    },
    { name: 'currentIndex', storage: 'number', interpretation: 'plain' },
    { name: 'totalQuestions', storage: 'number', interpretation: 'plain' },
    /** { prompt, options } for the live question — never the answer. */
    { name: 'currentQuestion', storage: 'text', interpretation: { kind: 'json' } },
    /** Epoch ms. The server rejects answers after this. */
    { name: 'questionEndsAt', storage: 'number', interpretation: 'plain' },
    /** -1 until the host reveals the current question. */
    { name: 'revealedIndex', storage: 'number', interpretation: 'plain' },
    { name: 'answeredCount', storage: 'number', interpretation: 'plain' },
    /** string[] of joined player ids — drives the `shared` read rule. */
    { name: 'playerIds', storage: 'text', interpretation: { kind: 'json' } },
  ],
  uniqueOn: ['joinCode'],
  ownerField: 'hostId',
  collaboratorsField: 'playerIds',
  permissions: {
    '*': NONE,
    viewer: NONE,
    // Host and joined players can read; nobody writes except server actions.
    member: { read: 'shared', create: false, update: false, delete: false },
    admin: ADMIN_ALL,
  },
}

export const playersSchema: CollectionSchema = {
  name: 'players',
  columns: [
    { name: 'gameId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, userBound: true, immutable: true },
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: 60 },
    { name: 'score', storage: 'number', interpretation: 'plain' },
    /** Points earned on the most recently revealed question (for the reveal screen). */
    { name: 'lastPoints', storage: 'number', interpretation: 'plain' },
  ],
  uniqueOn: ['gameId', 'userId'],
  ownerField: 'userId',
  permissions: {
    '*': NONE,
    viewer: NONE,
    // Leaderboard rows are readable by signed-in members; written only by actions.
    member: { read: true, create: false, update: false, delete: false },
    admin: ADMIN_ALL,
  },
}

export const answersSchema: CollectionSchema = {
  name: 'answers',
  columns: [
    { name: 'gameId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'questionIndex', storage: 'number', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, userBound: true, immutable: true },
    { name: 'choice', storage: 'number', interpretation: 'plain', required: true },
    /** Epoch ms, stamped by the server — used for speed bonus. */
    { name: 'answeredAt', storage: 'number', interpretation: 'plain', required: true },
    { name: 'points', storage: 'number', interpretation: 'plain' },
  ],
  uniqueOn: ['gameId', 'questionIndex', 'userId'],
  ownerField: 'userId',
  permissions: {
    '*': NONE,
    viewer: NONE,
    // A player sees only their own answers; written only by `submitAnswer`.
    member: { read: 'own', create: false, update: false, delete: false },
    admin: ADMIN_ALL,
  },
}
