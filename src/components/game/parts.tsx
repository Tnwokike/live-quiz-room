import { cn } from '@/components/ui'
import type { Player } from '@/lib/game'

export const OPTION_STYLES = [
  { shape: '▲', tone: 'bg-rose-500/90 hover:bg-rose-500' },
  { shape: '◆', tone: 'bg-sky-500/90 hover:bg-sky-500' },
  { shape: '●', tone: 'bg-amber-500/90 hover:bg-amber-500' },
  { shape: '■', tone: 'bg-emerald-500/90 hover:bg-emerald-500' },
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
      <span className="w-8 text-right font-mono text-lg tabular-nums">{seconds}</span>
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
        const dim = (showReveal && !isCorrect) || (picked != null && picked !== i && !showReveal)
        return (
          <button
            key={i}
            type="button"
            disabled={disabled || !onPick}
            onClick={() => onPick?.(i)}
            className={cn(
              'flex min-h-20 items-center gap-3 rounded-xl px-4 py-3 text-left font-medium text-white transition',
              style.tone,
              dim && 'opacity-35',
              isCorrect && 'ring-4 ring-foreground/80',
              picked === i && !showReveal && 'ring-4 ring-foreground/60',
              'disabled:cursor-default',
            )}
          >
            <span aria-hidden className="text-xl">{style.shape}</span>
            <span className="flex-1">{opt}</span>
            {counts && <span className="font-mono tabular-nums">{counts[i] ?? 0}</span>}
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
          <span className="w-6 font-mono text-sm tabular-nums text-muted-foreground">{i + 1}</span>
          {online && (
            <span
              className={cn('size-2 rounded-full', online.has(p.userId) ? 'bg-success' : 'bg-muted-foreground/40')}
              title={online.has(p.userId) ? 'Connected' : 'Not connected'}
            />
          )}
          <span className="flex-1 truncate">{p.name}</span>
          {p.lastPoints > 0 && <span className="text-xs text-success">+{p.lastPoints}</span>}
          <span className="font-mono tabular-nums">{p.score}</span>
        </li>
      ))}
    </ol>
  )
}
