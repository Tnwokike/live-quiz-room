import { cn } from '@/components/ui'
import type { Player } from '@/lib/game'

/** Each option has a theme color AND a shape, so color is never the only cue. */
export const OPTION_STYLES = [
  { shape: '▲', tone: 'bg-option-1' },
  { shape: '◆', tone: 'bg-option-2' },
  { shape: '●', tone: 'bg-option-3' },
  { shape: '■', tone: 'bg-option-4' },
] as const

export function Countdown({ seconds, total }: { seconds: number; total: number }) {
  const pct = total > 0 ? (seconds / total) * 100 : 0
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', seconds <= 5 ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right font-display text-lg font-semibold tabular-nums">{seconds}</span>
    </div>
  )
}

/** Options as large tiles. `revealed` marks the correct one; `counts` shows the spread. */
export function OptionGrid({
  options,
  onPick,
  picked,
  revealed,
  counts,
  disabled,
}: {
  options: string[]
  onPick?: (i: number) => void
  picked?: number | null
  revealed?: number
  counts?: number[] | null
  disabled?: boolean
}) {
  const showReveal = typeof revealed === 'number' && revealed >= 0
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((opt, i) => {
        const style = OPTION_STYLES[i % OPTION_STYLES.length]
        const isCorrect = showReveal && i === revealed
        const isPick = picked === i
        // After reveal: correct tile full strength, your wrong pick half, the rest faded.
        const dim = showReveal ? (isCorrect ? null : isPick ? 'opacity-60' : 'opacity-30') : picked != null && !isPick ? 'opacity-35' : null
        return (
          <button
            key={i}
            type="button"
            disabled={disabled || !onPick}
            onClick={() => onPick?.(i)}
            className={cn(
              'flex min-h-20 items-center gap-3 rounded-xl px-4 py-3 text-left font-medium text-option-foreground shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-md enabled:active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none',
              style.tone,
              dim,
              isCorrect && 'ring-4 ring-foreground ring-offset-2 ring-offset-background',
              isPick && !showReveal && 'ring-4 ring-foreground ring-offset-2 ring-offset-background',
              'disabled:cursor-default',
            )}
          >
            <span aria-hidden className="text-xl">{style.shape}</span>
            <span className="flex-1">{opt}</span>
            {isPick && (showReveal || picked != null) && (
              <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-foreground">Your answer</span>
            )}
            {counts && <span className="font-display text-lg font-semibold tabular-nums">{counts[i] ?? 0}</span>}
            {isCorrect && <span className="sr-only">(correct answer)</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Leaderboard({
  players,
  highlight,
  limit = 10,
  online,
}: {
  players: (Player & { recordId?: string })[]
  highlight?: string | null
  limit?: number
  online?: Set<string>
}) {
  if (players.length === 0) return <p className="text-sm text-muted-foreground">No players yet.</p>
  return (
    <ol className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {players.slice(0, limit).map((p, i) => (
        <li key={p.userId} className={cn('flex items-center gap-3 px-4 py-2.5', p.userId === highlight && 'bg-primary/10')}>
          <span className="w-6 font-display text-sm tabular-nums text-muted-foreground">{i + 1}</span>
          {online && (
            <span
              className={cn('size-2 rounded-full', online.has(p.userId) ? 'bg-success' : 'bg-muted-foreground/40')}
              title={online.has(p.userId) ? 'Connected' : 'Not connected'}
            />
          )}
          <span className="flex-1 truncate">{p.name}</span>
          {p.lastPoints > 0 && <span className="text-xs text-success">+{p.lastPoints}</span>}
          <span className="font-display font-semibold tabular-nums">{p.score}</span>
        </li>
      ))}
    </ol>
  )
}
