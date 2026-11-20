# Agent log

Running record of what the coding agent (Claude Code) did and what I verified or changed myself.
Feeds the "what the agent did / what I verified" section of the submission note.

| Date | Agent did | I verified / changed |
|---|---|---|
| 2026-11-20 | Read the DeepSpace docs (permissions, data model, server actions, jobs, files, AI) and the StoryNest/ThreadHunt/RunningMap READMEs; proposed 5 ideas. | Chose the live quiz room idea. |
| 2026-11-20 | Found Node 25 is unsupported by DeepSpace; installed Node 24 alongside it via Homebrew. Scaffolded with `create-deepspace@0.44.2` (folder name has spaces, so scaffolded under a valid name and moved files in). | |
| 2026-11-20 | Wrote PLAN.md: schema design that keeps answers server-side, feature/tradeoff list, 5-day schedule. | |
| 2026-11-20 | First deploy with no GitHub remote → app source latched to DeepSpace (permanent). Live at https://live-quiz-room.app.space (HTTP 200). | Chose DeepSpace source + GitHub copy for reviewers. |
| 2026-11-20 | Wrote 5 schemas (`src/schemas/quiz-schemas.ts`): answer key only in host-only `questions`; `games` readable via `shared` (host + joined players); all member writes disabled so game state goes through server actions; `uniqueOn` for one answer per question and one player row per game. Added unit tests incl. SDK `lintSchemas`. Checked the linter isn't a no-op by breaking a schema on purpose: it flagged the missing `userBound`. | |
| 2026-11-20 (day 2) | Found JobRoom's `authorizeRead/Write` only see the caller's role, not the room, so a shared queue would let any member watch or cancel other hosts' jobs. Made per-host queues (`jobs:<userId>`) enforced in the `/ws/jobs` worker route. Read the SDK bundle to confirm `enqueuedBy` is set from the verified socket user, so the job trusts `enqueuedBy`, never a host id in the payload. | |
| 2026-11-20 (day 2) | Built `createQuiz` action → `generate-quiz` job (R2 download → Claude Sonnet 5.5 structured output via zod → validate → write questions, idempotent on retry), quizzes list + upload form, quiz review page with live progress, cancel/retry, inline question editing. Correct answer is placed at a random position in code, since models favour option A. Prompt fences notes and tells the model to ignore instructions inside them. | |
| 2026-11-20 (day 2) | E2E spec failed: job got `AppFileError: key outside scope`. Hypothesis: wrong key format. Docs confirmed `download()` takes the full stored `key`, not `relativeKey`. Fixed; spec passes (5 questions in ~10s). Spec also checks Bob can't read Alice's quiz, and Bob's valid token gets 403 on Alice's job queue but works on his own. | |
