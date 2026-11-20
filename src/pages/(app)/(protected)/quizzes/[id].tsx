/**
 * /quizzes/:id — watch generation, then review and fix questions.
 *
 * Only the host can open this usefully: `quizzes` and `questions` are
 * `read: 'own'` on hostId, so anyone else gets no records, not just a hidden UI.
 */

import { useState } from 'react'
import { useAuth, useJobs, useMutations, useQuery } from 'deepspace'
import { Badge, Button, Input, Textarea, cn, useToast } from '@/components/ui'
import { JobProgress } from '@/components/quiz/JobProgress'
import { Link, useParams } from '@/router'
import { hostJobRoomId, type Question, type Quiz } from '@/lib/quiz'

export default function QuizPage() {
  const { id } = useParams('/quizzes/:id')
  const { userId } = useAuth()
  const { records: quizzes, status: quizStatus } = useQuery<Quiz>('quizzes', { where: { recordId: id } })
  const { records: questions } = useQuery<Question>('questions', { where: { quizId: id }, orderBy: 'position' })
  const { jobs, cancel, retry } = useJobs(userId ? hostJobRoomId(userId) : '')
  const quiz = quizzes[0]

  if (quizStatus === 'loading') return <Centered>Loading…</Centered>
  if (!quiz) {
    return (
      <Centered>
        Quiz not found. <Link to="/quizzes" className="underline">Back to your quizzes</Link>
      </Centered>
    )
  }

  const job = jobs.find((j) => j.id === quiz.data.jobId)
  const jobActive = job?.status === 'queued' || job?.status === 'running'
  const showProgress = quiz.data.status === 'generating' || quiz.data.status === 'failed' || jobActive

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <Link to="/quizzes" className="text-sm text-muted-foreground hover:text-foreground">← Your quizzes</Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{quiz.data.title}</h1>
            <p className="text-sm text-muted-foreground">From {quiz.data.sourceName}</p>
          </div>
          {quiz.data.status === 'ready' && (
            <Button disabled title="Live hosting arrives in the next step">Host live game</Button>
          )}
        </div>
      </header>

      {showProgress && (
        <section className="rounded-xl border border-border bg-card p-5">
          {quiz.data.status === 'failed' && !jobActive && quiz.data.error && !job && (
            <p className="mb-2 text-sm text-destructive">{quiz.data.error}</p>
          )}
          <JobProgress job={job} onCancel={cancel} onRetry={retry} />
        </section>
      )}

      {quiz.data.status === 'ready' && (
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">{questions.length} questions</h2>
            <p className="text-xs text-muted-foreground">Only you can see the answers.</p>
          </div>
          <ol className="flex flex-col gap-3">
            {questions.map((q, i) => (
              <QuestionCard key={q.recordId} recordId={q.recordId} index={i} question={q.data} />
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function QuestionCard({ recordId, index, question }: { recordId: string; index: number; question: Question }) {
  const { putConfirmed, ready } = useMutations<Question>('questions')
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(question)
  const [saving, setSaving] = useState(false)

  const valid = draft.prompt.trim().length >= 5 && draft.options.every((o) => o.trim())

  async function save() {
    setSaving(true)
    try {
      await putConfirmed(recordId, {
        prompt: draft.prompt.trim(),
        options: draft.options.map((o) => o.trim()),
        correctIndex: draft.correctIndex,
        explanation: draft.explanation?.trim() ?? '',
      })
      setEditing(false)
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-card p-4">
        <Textarea rows={2} value={draft.prompt} maxLength={300} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs text-muted-foreground">Pick the correct answer</legend>
          {draft.options.map((opt, oi) => (
            <label key={oi} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correct-${recordId}`}
                checked={draft.correctIndex === oi}
                onChange={() => setDraft({ ...draft, correctIndex: oi })}
              />
              <Input
                value={opt}
                maxLength={120}
                onChange={(e) => setDraft({ ...draft, options: draft.options.map((o, j) => (j === oi ? e.target.value : o)) })}
              />
            </label>
          ))}
        </fieldset>
        <Input
          value={draft.explanation ?? ''}
          maxLength={300}
          placeholder="Why the answer is right (optional)"
          onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} loading={saving} disabled={!ready || !valid}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => { setDraft(question); setEditing(false) }}>Cancel</Button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">
          <span className="mr-2 tabular-nums text-muted-foreground">{index + 1}.</span>
          {question.prompt}
        </p>
        <Button size="sm" variant="ghost" onClick={() => { setDraft(question); setEditing(true) }}>Edit</Button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {question.options.map((opt, oi) => (
          <li
            key={oi}
            className={cn(
              'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
              oi === question.correctIndex ? 'border-success bg-success/10' : 'border-border',
            )}
          >
            <span>{opt}</span>
            {oi === question.correctIndex && <Badge variant="success" size="sm">Answer</Badge>}
          </li>
        ))}
      </ul>
      {question.explanation && <p className="text-xs text-muted-foreground">{question.explanation}</p>}
    </li>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center gap-1 px-4 text-sm text-muted-foreground">{children}</div>
}
