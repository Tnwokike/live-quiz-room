/**
 * Quiz generation, end to end, against the real AI provider.
 *
 * Alice pastes notes → createQuiz action → background job → questions appear
 * with live progress. Then Bob opens Alice's quiz URL and must get nothing:
 * `quizzes`/`questions` are `read: 'own'`, so the record room never sends
 * them to him (this checks the server rule, not a hidden button).
 *
 * Spends a little of the app owner's AI credits per run.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts (see collab.spec.ts).')

const NOTES = `
Photosynthesis converts light energy into chemical energy stored in glucose.
It happens in chloroplasts, which contain the green pigment chlorophyll.
The light-dependent reactions take place in the thylakoid membranes and produce ATP and NADPH,
releasing oxygen as a by-product when water molecules are split.
The Calvin cycle takes place in the stroma. It uses ATP and NADPH to fix carbon dioxide into
three-carbon sugars, with the enzyme RuBisCO catalysing the first step of carbon fixation.
Factors that limit the rate of photosynthesis include light intensity, carbon dioxide concentration,
and temperature. C4 and CAM plants have adaptations that reduce photorespiration in hot, dry climates.
`.trim()

test('host generates a quiz; another user cannot read it', async ({ users }) => {
  test.setTimeout(180_000)
  const [alice, bob] = await users(['Alice', 'Bob'])

  await alice.page.goto('/quizzes')
  await alice.page.getByLabel('Quiz title').fill('Photosynthesis check')
  await alice.page.getByRole('button', { name: 'Paste text' }).click()
  await alice.page.getByPlaceholder('Paste your notes here…').fill(NOTES)
  await alice.page.getByRole('radio', { name: '5' }).click()
  await alice.page.getByRole('button', { name: 'Generate quiz' }).click()

  // Lands on the quiz page and shows live job progress.
  await expect(alice.page).toHaveURL(/\/quizzes\/[^/]+$/)
  const quizUrl = alice.page.url()
  await expect(alice.page.getByRole('progressbar')).toBeVisible({ timeout: 15_000 })

  // Questions arrive once the job finishes.
  await expect(alice.page.getByRole('heading', { name: '5 questions' })).toBeVisible({ timeout: 150_000 })
  const cards = alice.page.locator('ol > li')
  await expect(cards).toHaveCount(5)
  for (let i = 0; i < 5; i++) {
    // Exactly one marked answer per question.
    await expect(cards.nth(i).getByText('Answer', { exact: true })).toHaveCount(1)
  }

  // Bob gets no records for Alice's quiz. The page also opens Bob's own job
  // queue socket; capture its URL to reuse his verified token below.
  const bobJobSocket = bob.page.waitForEvent('websocket', (ws) => ws.url().includes('/ws/jobs/'))
  await bob.page.goto(quizUrl)
  await expect(bob.page.getByText('Quiz not found.')).toBeVisible()
  await expect(bob.page.getByText('Photosynthesis check')).toHaveCount(0)

  // Bob, signed in, tries to open Alice's private job queue: the worker
  // route must refuse (403) even though his token is valid.
  const bobUrl = new URL((await bobJobSocket).url())
  const bobRoom = decodeURIComponent(bobUrl.pathname.split('/').pop()!)
  expect(bobRoom).toMatch(/^jobs:/)
  const aliceUserId = alice.userId
  expect(aliceUserId).toBeTruthy()
  const res = await bob.page.request.get(
    `/ws/jobs/${encodeURIComponent(`jobs:${aliceUserId}`)}?token=${bobUrl.searchParams.get('token')}`,
  )
  expect(res.status()).toBe(403)
  // Control: the same token on Bob's own queue is not refused by the room check.
  const own = await bob.page.request.get(`/ws/jobs/${encodeURIComponent(bobRoom)}?token=${bobUrl.searchParams.get('token')}`)
  expect(own.status()).not.toBe(403)
})

test('a failed generation explains why and offers retry', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await alice.page.goto('/quizzes')
  await alice.page.getByLabel('Quiz title').fill('Too short')
  await alice.page.getByRole('button', { name: 'Paste text' }).click()
  // Under the 200-character minimum: the job fails before any AI call.
  await alice.page.getByPlaceholder('Paste your notes here…').fill('Mitochondria make ATP.')
  await alice.page.getByRole('button', { name: 'Generate quiz' }).click()

  await expect(alice.page.getByText('Notes are too short to make a quiz from.')).toBeVisible({ timeout: 30_000 })
  await expect(alice.page.getByRole('button', { name: 'Retry' })).toBeVisible()

  // The list reflects it too.
  await alice.page.getByRole('link', { name: '← Your quizzes' }).click()
  await expect(alice.page.locator('li', { hasText: 'Too short' }).getByText('Failed')).toBeVisible()
})
