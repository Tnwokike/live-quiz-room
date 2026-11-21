/**
 * Full live game with two real users: Alice hosts, Bob plays.
 *
 * Besides the happy path, this checks the two promises the app makes:
 *  1. The answer key never reaches a player. Every WebSocket frame Bob's
 *     browser receives is recorded and searched for `correctIndex`.
 *  2. The server, not the UI, enforces one answer per question and the
 *     deadline: Bob's real token is used to call submitAnswer directly.
 *
 * Generates one quiz with the real AI provider (small credit cost).
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts (see collab.spec.ts).')

const NOTES = `
The French Revolution began in 1789 with the meeting of the Estates-General and the storming of the Bastille.
Causes included a fiscal crisis from war debts, food shortages after poor harvests, and Enlightenment ideas
about popular sovereignty. The National Assembly issued the Declaration of the Rights of Man and of the Citizen.
The monarchy was abolished in 1792 and Louis XVI was executed in 1793. The Reign of Terror, led by the Committee
of Public Safety under Robespierre, saw thousands executed before Robespierre's own fall in 1794.
The Directory governed from 1795 until Napoleon Bonaparte's coup of 1799 established the Consulate.
`.trim()

async function action(page: Page, token: string, name: string, body: Record<string, unknown>) {
  const res = await page.request.post(`/api/actions/${name}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  })
  return (await res.json()) as { success: boolean; error?: string; data?: unknown }
}

test('host runs a full game; player never receives the answer key', async ({ users }) => {
  test.setTimeout(240_000)
  const [alice, bob] = await users(['Alice', 'Bob'])

  // Record everything Bob's browser receives over WebSockets, and grab his token.
  const bobFrames: string[] = []
  let bobToken = ''
  bob.page.on('websocket', (ws) => {
    const t = new URL(ws.url()).searchParams.get('token')
    if (t) bobToken = t
    ws.on('framereceived', (f) => bobFrames.push(typeof f.payload === 'string' ? f.payload : f.payload.toString('utf8')))
  })

  // --- Alice makes a quiz and opens a lobby ---
  await alice.page.goto('/quizzes')
  await alice.page.getByLabel('Quiz title').fill('French Revolution')
  await alice.page.getByRole('button', { name: 'Paste text' }).click()
  await alice.page.getByPlaceholder('Paste your notes here…').fill(NOTES)
  await alice.page.getByRole('radio', { name: '5' }).click()
  await alice.page.getByRole('button', { name: 'Generate quiz' }).click()
  await expect(alice.page.getByRole('heading', { name: '5 questions' })).toBeVisible({ timeout: 150_000 })
  await alice.page.getByRole('button', { name: 'Host live game' }).click()
  await expect(alice.page).toHaveURL(/\/host\//)
  const code = (await alice.page.getByTestId('join-code').textContent())!.trim()
  expect(code).toMatch(/^[A-Z0-9]{6}$/)

  // --- Bob joins with the code ---
  await bob.page.goto('/join')
  await bob.page.getByLabel('Game code').fill(code.toLowerCase())
  await bob.page.getByRole('button', { name: 'Join' }).click()
  await expect(bob.page.getByRole('heading', { name: /You're in/ })).toBeVisible({ timeout: 15_000 })

  // Alice sees Bob in the lobby and starts.
  await expect(alice.page.getByText('1 joined')).toBeVisible({ timeout: 10_000 })
  await alice.page.getByRole('button', { name: 'Start game' }).click()

  const gameId = alice.page.url().split('/host/')[1]
  const options = bob.page.locator('div.grid > button')

  for (let i = 0; i < 5; i++) {
    await expect(bob.page.getByText(`Question ${i + 1} of 5`)).toBeVisible({ timeout: 15_000 })
    await options.nth(i % 4).click()
    await expect(bob.page.getByText(/Answer locked in|Correct!|Not quite/)).toBeVisible({ timeout: 10_000 })

    if (i === 0) {
      // Server rejects a second answer to the same question.
      expect(bobToken).toBeTruthy()
      const dup = await action(bob.page, bobToken, 'submitAnswer', { gameId, choice: 1 })
      expect(dup.success).toBe(false)
      expect(dup.error).toMatch(/already answered|Time's up/)
    }

    // Bob was the only player, so the host auto-reveals once he answers.
    await expect(bob.page.getByText(/Correct!|Not quite/)).toBeVisible({ timeout: 15_000 })

    if (i === 0) {
      // After reveal, answering is closed server-side.
      const late = await action(bob.page, bobToken, 'submitAnswer', { gameId, choice: 0 })
      expect(late.success).toBe(false)
      expect(late.error).toMatch(/Time's up/)
      // And a player cannot drive the game.
      const hijack = await action(bob.page, bobToken, 'nextQuestion', { gameId })
      expect(hijack).toMatchObject({ success: false, error: 'Only the host can do that.' })
    }

    await alice.page.getByRole('button', { name: i === 4 ? 'Final results' : 'Next question' }).click()
  }

  // --- Results agree on both screens ---
  await expect(bob.page.getByRole('heading', { name: 'Game over' })).toBeVisible({ timeout: 15_000 })
  await expect(alice.page.getByRole('heading', { name: 'Final results' })).toBeVisible()
  const bobScore = await bob.page.getByTestId('final-score').textContent()
  await expect(alice.page.locator('ol li', { hasText: 'Bob' }).locator('span').last()).toHaveText(bobScore!)

  // --- The answer key never reached Bob ---
  // The schema-description frame names the `correctIndex` column (schemas
  // are public, they ship in the JS bundle); skip it. Every other frame is
  // data, and none may carry an answer key or any `questions` record.
  expect(bobFrames.length).toBeGreaterThan(0)
  const dataFrames = bobFrames.filter((f) => !f.startsWith('{"type":"records.list_schemas"'))
  const leaked = dataFrames.filter((f) => f.includes('correctIndex') || f.includes('"collection":"questions"'))
  expect(leaked, 'answer key appeared in a frame sent to a player').toHaveLength(0)
  // Sanity: Bob did receive live game data, so the check above isn't vacuous.
  expect(dataFrames.some((f) => f.includes('"collection":"games"') && f.includes('currentQuestion'))).toBe(true)
})

test('if the host disappears, the question still reveals after the deadline', async ({ users }) => {
  test.setTimeout(240_000)
  const [alice, bob] = await users(['Alice', 'Bob'])
  let bobToken = ''
  bob.page.on('websocket', (ws) => {
    const t = new URL(ws.url()).searchParams.get('token')
    if (t) bobToken = t
  })

  await alice.page.goto('/quizzes')
  await alice.page.getByLabel('Quiz title').fill('Host leaves')
  await alice.page.getByRole('button', { name: 'Paste text' }).click()
  await alice.page.getByPlaceholder('Paste your notes here…').fill(NOTES)
  await alice.page.getByRole('radio', { name: '5' }).click()
  await alice.page.getByRole('button', { name: 'Generate quiz' }).click()
  await expect(alice.page.getByRole('heading', { name: '5 questions' })).toBeVisible({ timeout: 150_000 })
  await alice.page.getByRole('button', { name: 'Host live game' }).click()
  const code = (await alice.page.getByTestId('join-code').textContent())!.trim()
  const gameId = alice.page.url().split('/host/')[1]

  await bob.page.goto(`/play/${code}`)
  await expect(bob.page.getByRole('heading', { name: /You're in/ })).toBeVisible({ timeout: 15_000 })
  await expect(alice.page.getByText('1 joined')).toBeVisible({ timeout: 10_000 })
  await alice.page.getByRole('button', { name: 'Start game' }).click()
  await expect(bob.page.getByText('Question 1 of 5')).toBeVisible({ timeout: 15_000 })

  // Host's screen goes away mid-question; Bob doesn't answer.
  await alice.page.close()

  // A player can't reveal early...
  const early = await action(bob.page, bobToken, 'revealQuestion', { gameId })
  expect(early).toMatchObject({ success: false, error: 'Only the host can reveal early.' })

  // ...but once time is up, Bob's client triggers the reveal and the game moves on.
  await expect(bob.page.getByText('No answer this time.')).toBeVisible({ timeout: 40_000 })
})
