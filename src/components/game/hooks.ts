import { useEffect, useRef, useState } from 'react'
import { useQuery } from 'deepspace'
import { callAction } from '@/lib/call-action'
import { rankPlayers, secondsLeft, type Game, type Player } from '@/lib/game'

/** serverNow - clientNow, measured once with a round-trip midpoint. */
export function useClockOffset(): number {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    let alive = true
    const sent = Date.now()
    callAction<{ now: number }>('serverTime', {})
      .then(({ now }) => {
        const received = Date.now()
        if (alive) setOffset(now - (sent + received) / 2)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return offset
}

/** Re-renders every 250ms while a deadline is pending; returns whole seconds left. */
export function useCountdown(endsAt: number | undefined, offset: number, active: boolean): number {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [active])
  return active ? secondsLeft(endsAt, offset) : 0
}

export function useGame(gameId: string | undefined) {
  const { records, status } = useQuery<Game>('games', { where: { recordId: gameId ?? '' } })
  return { game: records[0], status }
}

export function usePlayers(gameId: string | undefined) {
  const { records } = useQuery<Player>('players', { where: { gameId: gameId ?? '' } })
  return rankPlayers(records.map((r) => ({ ...r.data, recordId: r.recordId })))
}

/** Run `fn` once per distinct `key` while `when` holds. */
export function useOnce(key: string, when: boolean, fn: () => void) {
  const done = useRef<string | null>(null)
  useEffect(() => {
    if (when && done.current !== key) {
      done.current = key
      fn()
    }
  }, [key, when, fn])
}
