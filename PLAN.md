# Live Quiz Room: build plan

A host uploads study notes. A background job uses AI to turn them into a multiple-choice quiz.
Players join with a short code, answer live against a server-enforced timer, and watch a
leaderboard update in real time.

## Core path (must work on the live URL)

1. Host signs in, uploads a `.txt` / `.md` file (or pastes text).
2. A background job generates N questions with live progress; host can cancel / retry.
3. Host reviews the quiz (and can fix a bad question), then opens a game → gets a join code.
4. Players sign in, enter the code, appear in the lobby (presence).
5. Host starts → each question shows to everyone with a countdown → players answer.
6. Host reveals → correct answer + points shown → leaderboard updates → next question.
7. Final results screen.

## Key design decision: who can see the answers

Players must never receive correct answers before the reveal. Hiding them in the UI is not
enough, because anything sent over the WebSocket can be read in devtools. So:

| Collection  | Holds | Who can read | Who writes |
|-------------|-------|--------------|------------|
| `quizzes`   | title, source file key, status | host only (`own`) | host / job |
| `questions` | prompt, options, **correctIndex** | host only (`ownerField: hostId`) | job, host edits |
| `games`     | join code, phase, current question **without answer**, deadline, revealed answer | any member | **server actions only** |
| `players`   | gameId, userId, name, score | any member | server actions only |
| `answers`   | gameId, question index, choice, time | own row only | server action `submitAnswer` |

- The answer key lives only in `questions`, which players can't read. When the host advances,
  a server action copies the prompt and options (not the answer) into the `games` record.
- `submitAnswer` is a server action, so the **deadline is checked on the server** (late answers
  are rejected). `uniqueOn [gameId, questionIndex, userId]` blocks double answers even if a
  client is tampered with.
- Scoring happens in the `revealQuestion` server action, never on the client.

## DeepSpace features used, and why

| Feature | Why it's here |
|---|---|
| Auth (Google/GitHub) | Stable player identity, so one person gets one score and one answer per question. |
| Records + real-time sync | Game phase, current question, leaderboard push to every screen instantly. |
| RBAC (`own`, `ownerField`, `userBound`, `uniqueOn`) | Server-enforced answer secrecy and one answer per player. |
| Server actions | Host-only game control, server-side timer check, scoring. |
| Background jobs | AI generation outlives the HTTP request; live progress, cancel, retry. |
| AI (`createDeepSpaceAI`) | Turn notes into structured questions. |
| File storage (R2, `self` scope) | Host's notes stay private to the host. |
| Presence | Lobby shows who's actually connected. |

**Left out on purpose:** payments (no reason to charge for an evaluation app), Yjs (nobody
co-edits text), cron (nothing recurring), messaging (adds noise during a timed quiz),
extra integrations (nothing they'd add to the core loop).

## Tradeoffs to explain in the writeup

- **Players must sign in.** Anonymous play is smoother, but it needs a public write path and
  weakens one-answer-per-person. v1 picks integrity; anonymous join is the top "next step".
- **One question type (multiple choice).** Keeps scoring and UI simple and polished.
- **Text/Markdown input first.** PDF support only if the AI helper takes documents cleanly.
- **One record scope for all games, keyed by `gameId`**, instead of a Durable Object per game.
  Simpler permissions; fine at this scale.

## Five-day schedule

| Day | Goal | Done when |
|---|---|---|
| 1 | Setup, register, deploy hello-world, schemas | Live URL loads, sign-in works |
| 2 | Upload → generation job → quiz review screen | A real file becomes a saved quiz with progress shown |
| 3 | Game loop: lobby, questions, answers, reveal, leaderboard | Full game works in two browsers locally |
| 4 | Two-user Playwright test, edge cases, design pass | Tests pass; job failure and late answers handled |
| 5 | Deploy, verify live with two accounts, README + writeup | Submission ready |

Day 3 evening = core path complete. Days 4–5 are buffer, polish, and verification.

## Edge cases to handle (day 4)

- Answer after the deadline → rejected by the server.
- Player joins mid-game → enters at the current question, score 0.
- Player refreshes → rejoins the same player row.
- Generation fails or returns malformed JSON → job fails visibly, retry button works.
- Non-host calls a host action → refused.
