# Submission note (draft: edit into your own words before pasting)

**Live URL:** https://live-quiz-room.app.space
**Repository:** https://github.com/Tnwokike/live-quiz-room

## What I built
Live Quiz Room turns study notes into a live, timed multiple-choice game. A host uploads
notes, a background AI job writes the questions (with live progress, cancel and retry), the
host reviews them, then opens a lobby. Players join with a code on their phones, answer
against a server-enforced timer, and see a live leaderboard after each reveal.

## DeepSpace integrations used
Auth; real-time records; RBAC (`own`, `shared` with `collaboratorsField`, `userBound`,
`uniqueOn`, `writableFields`); server actions for every game-state change; background jobs for
AI generation; `createDeepSpaceAI` (Claude Sonnet 5.5, structured output); private R2 file
storage for notes; presence in the lobby. Left out on purpose: payments, Yjs, cron,
messaging and extra integrations, because none of them improves a 20-second quiz loop.

## Main tradeoff
Integrity over convenience: players must sign in. Anonymous join is smoother but needs a
public write path and weakens one-answer-per-person. The answer key never leaves the server
until the reveal: it lives in a host-only collection, and the shared game record only ever
gets the prompt and options.

## What the agent did
Claude Code read the DeepSpace docs and SDK source, proposed the schema/RBAC design, and wrote
most of the code and tests: actions, job, pages, theme, and Playwright specs. A running log is
in `AGENT_LOG.md`. It also found its own bugs through tests and SDK reading: the wrong R2 key
format, a local dev-server crash from an empty room id, query pages being capped (scores could
silently drop answers), and player names showing as "Player" in production.

## What I verified or changed myself
- I chose the idea and scope, and chose DeepSpace source control with a GitHub copy.
- I made every commit and deploy myself, and reviewed each diff before committing.
- I played real games on the live site from my phone with a second account: **[what you saw, anything that broke or felt off]**
- I read the generated questions for my own notes and checked the marked answers: **[how good they were; any wrong answers you fixed with the edit screen]**
- I can explain the security model: why a player can't cheat by reading WebSocket traffic, and how the server enforces the deadline and one answer per question.

**Next if I had more time:** anonymous join, host hand-off, tighter `players` read rule, PDF input.
