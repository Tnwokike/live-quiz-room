/**
 * /play/:code — the player's phone screen.
 *
 * Joining is the `joinGame` action (idempotent), so refreshing or opening the
 * link again just rejoins. The game record only reaches this client once the
 * action has added the player to `playerIds` (the `shared` read rule). If it
 * hasn't arrived shortly after joining, rejoin once to heal a lost update.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth, usePresenceRoom, useQuery } from 'deepspace'
import { useToast } from '@/components/ui'
import { Countdown, Leaderboard, OptionGrid } from '@/components/game/parts'
import { useClockOffset, useCountdown, useGame, usePlayers } from '@/components/game/hooks'
import { callAction } from '@/lib/call-action'
import { ANSWER_GRACE_MS, normalizeJoinCode, QUESTION_DURATION_MS, type Answer } from '@/lib/game'
import { Link, useNavigate, useParams } from '@/router'

type JoinResult = { gameId: string; role: 'host' | 'player' }

export default function PlayPage() {
  const { code: rawCode } = useParams('/play/:code')
  const code = normalizeJoinCode(rawCode)
  const navigate = useNavigate()
  const [gameId, setGameId] = useState<string>()
  const [joinError, setJoinError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const rejoin = useCallback(() => setAttempt((n) => (n < 2 ? n + 1 : n)), [])

  useEffect(() => {
    let alive = true
    callAction<JoinResult>('joinGame', { code })
      .then((r) => {
        if (!alive) return
        if (r.role === 'host') navigate('/host/:gameId', { params: { gameId: r.gameId }, replace: true })
        else setGameId(r.gameId)
      })
      .catch((err) => alive && setJoinError(err instanceof Error ? err.message : 'Could not join.'))
    return () => {
      alive = false
    }
  }, [code, attempt, navigate])

  if (joinError) {
    return (
      <Screen>
        <p className="text-lg">{joinError}</p>
        <Link to="/join" className="text-sm underline">Try another code</Link>
      </Screen>
    )
  }
  if (!gameId) return <Screen><p className="text-muted-foreground">Joining {code}…</p></Screen>
  // Game hooks mount only once we have a real id, so no socket opens for an empty room.
  return <PlayGame gameId={gameId} code={code} onMissing={rejoin} />
}

function PlayGame({ gameId, code, onMissing }: { gameId: string; code: string; onMissing: () => void }) {
  const { userId } = useAuth()
  const toast = useToast()
  const { game, status } = useGame(gameId)
  const players = usePlayers(gameId)
  usePresenceRoom(`game:${gameId}`)
  const offset = useClockOffset()
  const { records: myAnswers } = useQuery<Answer>('answers', { where: { gameId } })
  const [picked, setPicked] = useState<{ index: number; choice: number } | null>(null)

  // Heal: joined but the game record hasn't been shared with us yet.
  useEffect(() => {
    if (game || status === 'loading') return
    const t = setTimeout(onMissing, 3000)
    return () => clearTimeout(t)
  }, [game, status, onMissing])

  const g = game?.data
  const live = g?.phase === 'question'
  const seconds = useCountdown(g?.questionEndsAt, offset, live)
  const myAnswer = myAnswers.find((a) => a.data.questionIndex === g?.currentIndex)?.data
  const myChoice = myAnswer?.choice ?? (picked?.index === g?.currentIndex ? picked?.choice : undefined)
  const me = players.find((p) => p.userId === userId)
  const rank = me ? players.findIndex((p) => p.userId === userId) + 1 : 0

  // Fallback if the host's screen stalls: once time is up (plus the server's
  // grace window and some jitter so players don't all fire at once), ask the
  // server to reveal. It refuses unless the deadline really has passed, and
  // the normal case never gets here because the host reveals first.
  const timeUp = live && seconds === 0
  useEffect(() => {
    if (!timeUp) return
    const t = setTimeout(() => {
      callAction('revealQuestion', { gameId }).catch(() => {})
    }, ANSWER_GRACE_MS + 2500 + Math.random() * 1500)
    return () => clearTimeout(t)
  }, [timeUp, gameId, g?.currentIndex])

  const answer = useCallback(
    async (choice: number) => {
      if (!g || myChoice != null) return
      setPicked({ index: g.currentIndex, choice })
      try {
        await callAction('submitAnswer', { gameId, choice })
      } catch (err) {
        setPicked(null)
        toast.error('Answer not counted', err instanceof Error ? err.message : undefined)
      }
    },
    [gameId, g, myChoice, toast],
  )

  if (!g) return <Screen><p className="text-muted-foreground">Joining {code}…</p></Screen>

  if (g.phase === 'lobby') {
    return (
      <Screen>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{g.title}</p>
        <h1 className="text-3xl font-semibold">You're in{me ? `, ${me.name}` : ''}!</h1>
        <p className="text-muted-foreground">Waiting for the host to start…</p>
        <p className="text-sm text-muted-foreground">{players.length} player{players.length === 1 ? '' : 's'} here</p>
      </Screen>
    )
  }

  if (g.phase === 'finished') {
    return (
      <Screen wide>
        <h1 className="text-3xl font-semibold">Game over</h1>
        {me && <p className="text-lg">You finished <strong>#{rank}</strong> with <span className="font-display font-semibold" data-testid="final-score">{me.score}</span> points.</p>}
        <Leaderboard players={players} highlight={userId} limit={100} />
      </Screen>
    )
  }

  const q = g.currentQuestion
  if (!q) return <Screen><p className="text-muted-foreground">Get ready…</p></Screen>
  const revealed = g.phase === 'reveal'
  const correct = revealed && myAnswer != null && myAnswer.choice === g.revealedIndex

  return (
    <Screen wide>
      <p className="text-sm text-muted-foreground">
        Question {g.currentIndex + 1} of {g.totalQuestions}
      </p>
      <h1 className="text-xl font-semibold leading-snug sm:text-2xl">{q.prompt}</h1>
      {live && <Countdown seconds={seconds} total={Math.round((g.questionDurationMs ?? QUESTION_DURATION_MS) / 1000)} />}
      <OptionGrid
        options={q.options}
        onPick={live && myChoice == null && seconds > 0 ? answer : undefined}
        picked={myChoice}
        revealed={revealed ? g.revealedIndex : undefined}
      />
      <div aria-live="polite" className="min-h-12 text-center">
        {live && myChoice != null && <p className="text-muted-foreground">Answer locked in. Waiting for others…</p>}
        {live && myChoice == null && seconds === 0 && <p className="text-muted-foreground">Time's up.</p>}
        {revealed && myAnswer == null && <p className="text-lg">No answer this time.</p>}
        {revealed && myAnswer != null && (
          <p className={correct ? 'text-lg text-success' : 'text-lg text-destructive'}>
            {correct ? `Correct! +${me?.lastPoints ?? 0}` : 'Not quite.'}
          </p>
        )}
        {revealed && me && <p className="text-sm text-muted-foreground">You're #{rank} with {me.score} points</p>}
      </div>
    </Screen>
  )
}

function Screen({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto flex min-h-full w-full flex-col justify-center gap-5 px-4 py-8 ${wide ? 'max-w-3xl' : 'max-w-md items-center text-center'}`}>
      {children}
    </div>
  )
}
