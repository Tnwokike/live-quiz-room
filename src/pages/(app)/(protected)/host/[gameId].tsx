/**
 * /host/:gameId — the host's big screen: lobby → question → reveal → results.
 *
 * The host drives the game through server actions. The question auto-reveals
 * when time runs out or when every joined player has answered, so the host
 * isn't stuck clicking during a timed round.
 */

import { useCallback, useState } from 'react'
import { usePresenceRoom } from 'deepspace'
import { Button, ConfirmModal, useToast } from '@/components/ui'
import { Countdown, Leaderboard, OptionGrid } from '@/components/game/parts'
import { useClockOffset, useCountdown, useGame, useOnce, usePlayers } from '@/components/game/hooks'
import { callAction } from '@/lib/call-action'
import { QUESTION_DURATION_MS } from '@/lib/game'
import { Link, useParams } from '@/router'

export default function HostPage() {
  const { gameId } = useParams('/host/:gameId')
  const { game, status } = useGame(gameId)
  const players = usePlayers(gameId)
  const { peers } = usePresenceRoom(`game:${gameId}`)
  const online = new Set(peers.map((p) => p.userId))
  const offset = useClockOffset()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)

  const g = game?.data
  const live = g?.phase === 'question'
  const seconds = useCountdown(g?.questionEndsAt, offset, live)
  const duration = Math.round((g?.questionDurationMs ?? QUESTION_DURATION_MS) / 1000)

  const run = useCallback(
    async (action: string) => {
      setBusy(true)
      try {
        await callAction(action, { gameId })
      } catch (err) {
        toast.error('Something went wrong', err instanceof Error ? err.message : undefined)
      } finally {
        setBusy(false)
      }
    },
    [gameId, toast],
  )

  // Auto-reveal: time is up, or everyone who joined has answered.
  const everyoneAnswered = live && players.length > 0 && (g?.answeredCount ?? 0) >= players.length
  const reveal = useCallback(() => void run('revealQuestion'), [run])
  useOnce(`${gameId}:${g?.currentIndex}`, live && (seconds === 0 || everyoneAnswered), reveal)

  if (status === 'loading') return <Shell><p className="text-muted-foreground">Loading…</p></Shell>
  if (!g) return <Shell><p className="text-muted-foreground">Game not found.</p></Shell>

  return (
    <Shell>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{g.title}</p>
          {g.phase !== 'lobby' && g.phase !== 'finished' && (
            <p className="text-sm text-muted-foreground">
              Question {g.currentIndex + 1} of {g.totalQuestions}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-2">
          <span className="text-xs leading-tight text-muted-foreground">
            Join at
            <br />
            <span className="font-medium text-foreground">{window.location.host}/join</span>
          </span>
          <span className="font-display text-3xl font-bold tracking-[0.15em]" data-testid="join-code">{g.joinCode}</span>
        </div>
      </header>

      {g.phase === 'lobby' && (
        <section className="flex flex-col gap-6">
          <div className="flex items-end justify-between">
            <h1 className="text-3xl font-semibold tracking-tight">Waiting for players</h1>
            <span className="text-sm text-muted-foreground">{players.length} joined</span>
          </div>
          <Leaderboard players={players} online={online} limit={100} />
          <div>
            <Button size="lg" onClick={() => run('nextQuestion')} loading={busy} disabled={players.length === 0}>
              Start game
            </Button>
          </div>
        </section>
      )}

      {(g.phase === 'question' || g.phase === 'reveal') && g.currentQuestion && (
        <section className="flex flex-col gap-6">
          <h1 className="text-2xl font-semibold leading-snug sm:text-3xl">{g.currentQuestion.prompt}</h1>
          {live ? (
            <Countdown seconds={seconds} total={duration} />
          ) : (
            <p className="text-sm text-muted-foreground">{g.answeredCount} of {players.length} answered</p>
          )}
          <OptionGrid
            options={g.currentQuestion.options}
            revealed={g.phase === 'reveal' ? g.revealedIndex : undefined}
            counts={g.phase === 'reveal' ? g.answerCounts : null}
          />
          <div className="flex items-center justify-between gap-4">
            {live ? (
              <>
                <span className="text-sm text-muted-foreground" data-testid="answered-count">
                  {g.answeredCount} of {players.length} answered
                </span>
                <Button variant="outline" onClick={reveal} loading={busy}>Reveal now</Button>
              </>
            ) : (
              <>
                <span />
                <Button onClick={() => run('nextQuestion')} loading={busy}>
                  {g.currentIndex + 1 >= g.totalQuestions ? 'Final results' : 'Next question'}
                </Button>
              </>
            )}
          </div>
          {g.phase === 'reveal' && <Leaderboard players={players} limit={5} />}
        </section>
      )}

      {g.phase === 'finished' && (
        <section className="flex flex-col gap-6">
          <h1 className="text-3xl font-semibold tracking-tight">Final results</h1>
          <Leaderboard players={players} limit={100} />
          <Link to="/quizzes" className="text-sm text-muted-foreground hover:text-foreground">← Back to your quizzes</Link>
        </section>
      )}

      {g.phase !== 'finished' && (
        <footer className="pt-4">
          <Button variant="ghost" size="sm" onClick={() => setConfirmEnd(true)} disabled={busy}>End game</Button>
          <ConfirmModal
            open={confirmEnd}
            onClose={() => setConfirmEnd(false)}
            onConfirm={() => {
              setConfirmEnd(false)
              void run('endGame')
            }}
            title="End this game?"
            description="Everyone jumps to the final results. You can't resume it."
            confirmText="End game"
            variant="destructive"
          />
        </footer>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">{children}</div>
}
