import type { JobView } from 'deepspace'
import { Button } from '@/components/ui'

/** Live generation status for one quiz, driven by the host's private job queue. */
export function JobProgress({
  job,
  onCancel,
  onRetry,
}: {
  job: JobView | undefined
  onCancel: (id: string) => void
  onRetry: (id: string) => void
}) {
  if (!job) return <p className="text-sm text-muted-foreground">Waiting for the job to start…</p>

  if (job.status === 'queued' || job.status === 'running') {
    const pct = Math.round((job.progress ?? 0) * 100)
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{job.progressMessage ?? 'Queued'}</span>
          <span className="tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(pct, 4)}%` }} />
        </div>
        <div>
          <Button variant="ghost" size="sm" onClick={() => onCancel(job.id)}>Cancel</Button>
        </div>
      </div>
    )
  }

  if (job.status === 'failed' || job.status === 'canceled') {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-destructive">
          {job.status === 'canceled' ? 'Canceled.' : job.error ?? 'Generation failed.'}
        </span>
        <Button variant="outline" size="sm" onClick={() => onRetry(job.id)}>Retry</Button>
      </div>
    )
  }

  return null
}
