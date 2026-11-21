# Live Quiz Room

**Live:** https://live-quiz-room.app.space

Upload your study notes, get a multiple-choice quiz in seconds, then run it live:
friends join with a six-character code and answer on their phones against a
server-enforced timer, with a leaderboard that updates as you play.

Built on [DeepSpace](https://docs.deep.space) for the build exercise.

## The core path

1. **Host uploads notes** (`.txt`/`.md` or pasted text) → stored in the host's private R2 scope.
2. **A background job writes the quiz.** Claude returns structured questions, they're validated, and progress streams to the host's screen. Cancel and retry work.
3. **Host reviews and edits** questions, then opens a lobby and gets a join code.
4. **Players join** (`/join` or `/play/CODE`) and appear in the lobby with live presence dots.
5. **Questions run on a 20s timer.** The server timestamps every answer and rejects late or duplicate ones.
6. **Reveal** shows the correct answer, how many picked each option, points (500–1000, faster = more) and the leaderboard. Then next question, then final results.

## The main design decision: players never receive the answers

Anything sent to a browser can be read in devtools, so hiding answers in the UI isn't
enough. The answer key is kept server-side by the data model itself:

| Collection  | Holds | Members can read | Members can write |
|-------------|-------|------------------|-------------------|
| `quizzes`   | title, notes file key, status | own only | title only |
| `questions` | prompt, options, **`correctIndex`** | own only (host) | host edits during review |
| `games`     | join code, phase, current question **without answer**, deadline | host + joined players (`shared`) | no, server actions only |
| `players`   | name, score | yes | no, server actions only |
| `answers`   | choice, server timestamp, points | own only | no, server actions only |

- When the host advances, `nextQuestion` copies **only** the prompt and options into `games`.
- `submitAnswer` stamps the time on the server, enforces the deadline (+750ms grace), and `uniqueOn [gameId, questionIndex, userId]` makes double answers impossible even from a tampered client.
- `revealQuestion` scores on the server. Scores are **re-summed** from answer points, never incremented, so a double reveal can't double-score.

The two-player test (`tests/live-game.spec.ts`) records every WebSocket frame the
player's browser receives during a full game and asserts that no data frame contains
`correctIndex` or any `questions` record.

## DeepSpace features used, and why

| Feature | Where | Why it's here |
|---|---|---|
| Auth (Google/GitHub) | everywhere | Stable identity: one answer per person per question, one score per person. |
| Records + real-time sync | `useQuery` on games/players | Phase, current question, counts and leaderboard push to every screen instantly. |
| RBAC: `own`, `shared` + `collaboratorsField`, `ownerField`, `userBound`, `uniqueOn`, `writableFields` | `src/schemas/quiz-schemas.ts` | Server-enforced answer secrecy and integrity (table above). |
| Server actions | `src/actions/` | Host-only controls, server clock, scoring. Members have no direct write access to game state. |
| Background jobs (`JobRoom`) | `src/jobs.ts` | AI generation outlives the request; live progress, cancel, retry. |
| AI (`createDeepSpaceAI`, Claude Sonnet 5.5) | `src/jobs.ts` | Notes → structured questions via `Output.object` + zod. |
| File storage (`useR2Files` / `appFiles`, `self` scope) | upload form, job | Notes stay private to the host; the platform refuses keys outside that user's scope. |
| Presence (`usePresenceRoom`) | host lobby, player screen | Shows who is actually connected. |

**Left out on purpose:**
- **Payments:** nothing to charge for in an evaluation app.
- **Yjs collaborative editing:** nobody co-edits text here.
- **Cron:** nothing recurring.
- **Messaging:** a chat during a 20-second question adds noise, not value.
- **Extra integrations** (search, image generation): they wouldn't improve the core loop.

## Main tradeoff

**Integrity over convenience: players must sign in.** Anonymous join-by-code is
smoother, but it needs a public write path and weakens "one answer per person".
v1 chooses a verified identity per player; anonymous join is the first thing I'd add next.

Smaller tradeoffs:
- **One question type** (4-option multiple choice), so scoring and UI stay simple and polished.
- **Text/Markdown input only.** PDF would need document input to the model, plus extra cost and size limits.
- **One record scope for all games**, keyed by `gameId`, instead of a Durable Object per game. Simpler permissions, and fine at this scale.

## Notable engineering details

- **Per-host job queues.** `JobRoom`'s `authorizeRead/Write` see only the caller's role, not the room, so a shared queue would let any member watch or cancel another host's jobs. Each host gets `jobs:<userId>`, enforced in the `/ws/jobs` worker route. The job trusts `job.enqueuedBy` (set from the verified user), never a host id in its payload.
- **No transactions, so state is derived.** `players` rows are the source of truth for who joined; `games.playerIds` (which drives the `shared` read rule) is re-derived on every join and host action, so a lost update from simultaneous joins heals itself.
- **Paged reads.** `records.query` pages are capped (~30KB). `queryRows` follows `nextOffset` so scoring never silently drops answers in a big game.
- **Stalled host fallback.** If the host's tab closes mid-question, a player's client triggers the reveal after the deadline. The server refuses players revealing early.
- **Clock offset.** Each screen measures its offset from the server clock so countdowns match the deadline the server enforces.
- **Prompt injection.** Notes are fenced and the model is told to ignore instructions inside them; output is schema-validated before anything is written. The correct answer is placed at a random position in code (models favour option A).
- **Player names** come from the verified token's `name` claim, never from the client.

## Tests

```bash
npx vitest run                # 27 unit tests: scoring, deadlines, join codes, schema rules + SDK schema linter
npx deepspace test run all    # 17 Playwright specs incl. two-user flows (needs 2 test accounts)
```

Key specs:
- `tests/live-game.spec.ts`: full two-player game; answer-key leak check on every WebSocket frame; duplicate, late and non-host actions refused with a real player token; host-disappears fallback.
- `tests/quiz-generation.spec.ts`: real AI generation; another user can't read the quiz; another user's valid token gets 403 on the host's job queue; failed generation shows the reason + Retry.

To run them against the deployed site instead of a local server:

```bash
LIVE_URL=https://live-quiz-room.app.space npx playwright test -c tests/playwright.config.ts tests/live-game.spec.ts
```

## Run it locally

Requires Node 22.15+, 24 or 26 (odd versions are refused by DeepSpace).

```bash
npm install
npx deepspace auth login
npx deepspace dev start
```

No secrets live in the repo: AI and storage go through DeepSpace's platform with the
app's own identity, and `.dev.vars` / `.deepspace` are gitignored.

## Known limitations and what I'd do next

1. **Anonymous join** via a rate-limited public action, so players don't need an account.
2. **Host reconnect controls.** The game survives a host refresh (state is server-side), but if the host leaves for good the game sits at the reveal screen. Next: let the host hand off, or auto-advance.
3. **`players` is readable by any signed-in member** across games (names and scores only). Tightening it needs a per-game `shared` rule like `games`.
4. **PDF upload** using the model's document input.
5. **Larger-game load test.** Scoring reads every answer row on reveal; I'd measure it at 50+ players and move scoring into a job if needed.
6. A cross-isolate job cancel can't fire the abort signal, so in that rare case the quiz list keeps showing "Generating" until retry.

## Project layout

```
src/schemas/quiz-schemas.ts     collections + RBAC (the security model)
src/actions/index.ts            createQuiz → enqueues the job
src/actions/game.ts             startGame, joinGame, nextQuestion, submitAnswer, revealQuestion, endGame, serverTime
src/jobs.ts                     generate-quiz background job
src/lib/quiz.ts, game.ts        pure rules (unit-tested)
src/server/realtime-routes.ts   per-host job queue enforcement
src/pages/                      landing, home, quizzes, host, join, play
tests/                          Playwright specs
AGENT_LOG.md                    what the coding agent did vs what I verified
```
