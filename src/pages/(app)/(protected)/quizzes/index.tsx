/**
 * /quizzes — the host's quizzes and the "new quiz from notes" form.
 *
 * Flow: upload notes to the host's private R2 scope → `createQuiz` action
 * (creates the record + queues the AI job) → go to the quiz page, which
 * shows live job progress and then the questions.
 */

import { useState, type FormEvent } from 'react'
import { useQuery, useR2Files } from 'deepspace'
import { Badge, Button, EmptyState, Input, Label, Textarea, cn, useToast } from '@/components/ui'
import { Link, useNavigate } from '@/router'
import { callAction } from '@/lib/call-action'
import { MAX_SOURCE_BYTES, QUESTION_COUNTS, type Quiz, type QuizStatus } from '@/lib/quiz'

const STATUS_BADGE: Record<QuizStatus, { label: string; variant: 'info' | 'success' | 'destructive' }> = {
  generating: { label: 'Generating', variant: 'info' },
  ready: { label: 'Ready', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
}

export default function QuizzesPage() {
  const { records, status } = useQuery<Quiz>('quizzes', { orderBy: 'createdAt', orderDir: 'desc' })

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your quizzes</h1>
        <p className="text-sm text-muted-foreground">
          Upload study notes, get a multiple-choice quiz, then host it live.
        </p>
      </header>

      <NewQuizForm />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Recent</h2>
        {status === 'loading' ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : records.length === 0 ? (
          <EmptyState title="No quizzes yet" description="Your first one takes about thirty seconds." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {records.map((r) => {
              const badge = STATUS_BADGE[r.data.status]
              return (
                <li key={r.recordId}>
                  <Link
                    to="/quizzes/:id"
                    params={{ id: r.recordId }}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.data.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.data.sourceName} · {r.data.questionCount ?? '–'} questions
                      </p>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function NewQuizForm() {
  const { upload } = useR2Files() // default 'self' scope: only this host can read the notes
  const navigate = useNavigate()
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [pasted, setPasted] = useState('')
  const [count, setCount] = useState<number>(QUESTION_COUNTS[0])
  const [busy, setBusy] = useState(false)

  const source: Blob | null = mode === 'file' ? file : pasted.trim() ? new Blob([pasted], { type: 'text/plain' }) : null
  const sourceName = mode === 'file' ? file?.name ?? '' : 'pasted notes'
  const tooBig = !!source && source.size > MAX_SOURCE_BYTES
  const canSubmit = !!title.trim() && !!source && !tooBig && !busy

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!source || !canSubmit) return
    setBusy(true)
    try {
      const uploaded = await upload(source, mode === 'file' ? sourceName : 'pasted-notes.txt')
      if (!uploaded.success || !uploaded.key) throw new Error(uploaded.error ?? 'Upload failed.')
      const { quizId } = await callAction<{ quizId: string }>('createQuiz', {
        title,
        sourceKey: uploaded.key, // full stored key: what appFiles().download() takes
        sourceName,
        questionCount: count,
      })
      navigate('/quizzes/:id', { params: { id: quizId } })
    } catch (err) {
      toast.error('Could not start the quiz', err instanceof Error ? err.message : undefined)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Quiz title</Label>
        <Input id="title" value={title} maxLength={120} placeholder="Cell biology, week 3" onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={mode === 'file' ? 'notes-file' : 'notes-text'}>Notes</Label>
          <div className="flex gap-1 text-xs">
            {(['file', 'paste'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn('rounded-md px-2 py-1', mode === m ? 'bg-muted font-medium' : 'text-muted-foreground')}
              >
                {m === 'file' ? 'Upload file' : 'Paste text'}
              </button>
            ))}
          </div>
        </div>
        {mode === 'file' ? (
          <Input
            id="notes-file"
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        ) : (
          <Textarea id="notes-text" rows={8} value={pasted} placeholder="Paste your notes here…" onChange={(e) => setPasted(e.target.value)} />
        )}
        <p className={cn('text-xs', tooBig ? 'text-destructive' : 'text-muted-foreground')}>
          {tooBig ? 'That is over the 256 KB limit.' : '.txt or .md, up to 256 KB. Your notes stay private to you.'}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Questions</span>
        <div className="flex gap-2" role="radiogroup" aria-label="Number of questions">
          {QUESTION_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={count === n}
              onClick={() => setCount(n)}
              className={cn(
                'h-9 w-12 rounded-lg border text-sm tabular-nums',
                count === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Button type="submit" disabled={!canSubmit} loading={busy}>
          Generate quiz
        </Button>
      </div>
    </form>
  )
}
