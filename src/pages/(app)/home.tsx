/* home pattern: split-hero — join-by-code on one side, the host's quizzes (the primary surface) on the other */

/**
 * /home — the two things people come here to do: join a game someone else
 * is running, or host one of their own quizzes. Signed out, the quiz side
 * shows what you'd get plus a sign-in path (via /quizzes, which is gated).
 */

import { useAuthProfileReady, useQuery } from 'deepspace'
import { Badge, Button, EmptyState } from '@/components/ui'
import { JoinForm } from '@/components/game/JoinForm'
import { Link, useNavigate } from '@/router'
import type { Quiz, QuizStatus } from '@/lib/quiz'

const STATUS: Record<QuizStatus, { label: string; variant: 'info' | 'success' | 'destructive' }> = {
  generating: { label: 'Generating', variant: 'info' },
  ready: { label: 'Ready', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
}

export default function HomePage() {
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: true })
  const navigate = useNavigate()
  const { records, status } = useQuery<Quiz>('quizzes', { orderBy: 'createdAt', orderDir: 'desc', limit: 5 })
  const firstName = user?.name?.split(' ')[0]

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 md:grid-cols-[minmax(0,22rem)_1fr]">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <h1 className="text-3xl font-bold tracking-tight">Join a game</h1>
        <p className="text-sm text-muted-foreground">Got a code from the host's screen? Enter it here.</p>
        <JoinForm />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {isSignedIn && firstName ? `Your quizzes, ${firstName}` : 'Host a quiz'}
            </h2>
            <p className="text-sm text-muted-foreground">Turn your notes into a live game in under a minute.</p>
          </div>
          <Button onClick={() => navigate('/quizzes')}>{isSignedIn ? 'New quiz' : 'Sign in to host'}</Button>
        </div>

        {!isSignedIn ? (
          <ol className="flex flex-col divide-y divide-border rounded-2xl border border-border">
            {['Paste or upload your notes', 'Review the questions AI writes', 'Share the code and play live'].map((t, i) => (
              <li key={t} className="flex items-center gap-4 px-5 py-4">
                <span className="font-display text-xl font-bold text-primary tabular-nums">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        ) : status === 'loading' ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : records.length === 0 ? (
          <EmptyState
            title="No quizzes yet"
            description="Upload a page of notes and you'll have questions in about thirty seconds."
            action={{ label: 'Make your first quiz', onClick: () => navigate('/quizzes') }}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
            {records.map((r) => (
              <li key={r.recordId}>
                <Link to="/quizzes/:id" params={{ id: r.recordId }} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.data.title}</p>
                    <p className="text-xs text-muted-foreground">{r.data.questionCount ?? '–'} questions</p>
                  </div>
                  <Badge variant={STATUS[r.data.status].variant}>{STATUS[r.data.status].label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
