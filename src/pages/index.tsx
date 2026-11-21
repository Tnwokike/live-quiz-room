/**
 * Design Direction
 *
 * Product: Turns a study group's notes into a timed multiple-choice quiz that
 *   everyone answers live on their own phone.
 * Emotion: The night-before-the-exam nerves turning into a friendly rivalry.
 * Metaphor: A page of highlighted notes flipping over into a scoreboard.
 * References: A split-flap departures board; a yellow highlighter on lined
 *   paper; a pub-quiz answer sheet passed down the table.
 * Signature: Highlighted phrases in the notes become the coloured answer tiles.
 * Hero: A notes card and a phone side by side; the phone's timer drains, one
 *   tile locks in, and a +840 ticks onto the scoreboard.
 *
 * Style Tile
 * - Color: warm paper background, ink text, one tomato accent; the four answer
 *   hues appear only on answer tiles.
 * - Type: Space Grotesk (headings, scores) + Inter (body): readable numerals
 *   with a little game-show character; body that disappears on a phone.
 * - Theme: light; hosts project it in bright classrooms.
 * - Art direction: stationery: paper, ruled lines, highlighter marks.
 * - Motion: snappy and brief; one looping hero sequence, off under reduced motion.
 * - Voice: second person; short verbs; no hype words.
 *
 * Static page: no providers, prerendered to HTML. Animation is CSS keyframes
 * (styles.css, `lqr-*`), disabled under prefers-reduced-motion.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { APP_NAME } from '../constants'
import { Wordmark } from '../components/Wordmark'
import { seo } from '../seo'

const STEPS = [
  { n: '01', title: 'Drop in your notes', body: 'Paste text or upload a .txt or .md file.' },
  { n: '02', title: 'Get a quiz in seconds', body: 'Review every question and fix any before you play.' },
  { n: '03', title: 'Play it live', body: 'Friends join with a six-letter code. Fastest right answer wins.' },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-background text-foreground">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <Wordmark />
          <Link to="/join" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Have a code?
          </Link>
        </header>

        <main>
          <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-8 lg:grid-cols-[1fr_1.1fr] lg:pt-16">
            <div className="flex flex-col gap-6">
              <h1 className="text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
                Your notes, now a <span className="text-primary">live quiz.</span>
              </h1>
              <p className="max-w-md text-lg text-muted-foreground">
                Upload what you studied. Everyone answers on their phone, against the clock.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/quizzes"
                  className="inline-flex h-12 items-center rounded-xl bg-primary px-6 font-medium text-primary-foreground shadow-sm transition hover:shadow-md"
                >
                  Make a quiz
                </Link>
                <Link
                  to="/join"
                  className="inline-flex h-12 items-center rounded-xl border border-border bg-card px-6 font-medium transition hover:bg-muted"
                >
                  Join with a code
                </Link>
              </div>
            </div>
            <HeroMockup />
          </section>

          <section aria-label="How it works" className="border-y border-border bg-card">
            <ol className="mx-auto grid max-w-6xl divide-y divide-border px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4 py-8 sm:flex-col sm:gap-2 sm:px-6 sm:first:pl-0">
                  <span className="font-display text-3xl font-bold text-primary tabular-nums">{s.n}</span>
                  <div>
                    <h2 className="text-lg font-semibold">{s.title}</h2>
                    <p className="text-sm text-muted-foreground">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-lg font-display text-2xl font-semibold leading-snug">
              Fair by design: answers stay on the server until the reveal.
            </p>
            <Link
              to="/quizzes"
              className="inline-flex h-12 items-center rounded-xl bg-foreground px-6 font-medium text-background transition hover:opacity-90"
            >
              Start your first quiz
            </Link>
          </section>
        </main>

        <footer className="mx-auto flex max-w-6xl items-center justify-between border-t border-border px-4 py-6 text-xs text-muted-foreground">
          <span>{APP_NAME}</span>
          <span>Built on DeepSpace</span>
        </footer>
      </div>
    </>
  )
}

/** Notes card → phone with a live question. Pure markup + CSS keyframes. */
function HeroMockup() {
  const tiles = [
    { shape: '▲', text: 'Stroma', tone: 'bg-option-1' },
    { shape: '◆', text: 'Nucleus', tone: 'bg-option-2' },
    { shape: '●', text: 'Thylakoid', tone: 'bg-option-3', lock: true },
    { shape: '■', text: 'Cell wall', tone: 'bg-option-4' },
  ]
  return (
    <div aria-hidden className="relative mx-auto flex w-full max-w-xl items-center justify-center gap-4 sm:gap-6">
      {/* Notes card */}
      <div className="hidden w-52 -rotate-3 flex-col gap-2.5 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex">
        <span className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">Bio · week 3</span>
        {[
          'Light reactions happen in the ',
          'Calvin cycle runs in the ',
          'Chlorophyll absorbs ',
        ].map((line, i) => (
          <p key={i} className="border-b border-border pb-1.5 text-[11px] leading-snug text-muted-foreground">
            {line}
            <mark className="rounded-sm bg-option-3 px-0.5 text-option-foreground">
              {['thylakoid', 'stroma', 'red & blue light'][i]}
            </mark>
          </p>
        ))}
        <div className="h-1.5 w-3/4 rounded-full bg-muted" />
        <div className="h-1.5 w-1/2 rounded-full bg-muted" />
      </div>

      {/* Phone */}
      <div className="w-64 rotate-1 rounded-[2rem] border-4 border-foreground bg-background p-3 shadow-lg sm:w-72">
        <div className="flex items-center justify-between px-1 pb-2 text-[10px] text-muted-foreground">
          <span>Question 3 of 8</span>
          <span className="font-display font-semibold">ABC123</span>
        </div>
        <p className="px-1 pb-3 font-display text-sm font-semibold leading-snug">
          Where do the light-dependent reactions take place?
        </p>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="lqr-timer h-full rounded-full bg-primary" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <div
              key={t.text}
              className={`flex h-14 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-option-foreground ${t.tone} ${t.lock ? 'lqr-lock' : 'lqr-dim'}`}
            >
              <span>{t.shape}</span>
              {t.text}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
          <span className="font-medium">You · #1</span>
          <span className="flex items-center gap-2 font-display font-semibold tabular-nums">
            <span className="lqr-points text-success">+840</span>
            2,310
          </span>
        </div>
      </div>
    </div>
  )
}
