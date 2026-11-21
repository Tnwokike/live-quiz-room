/** /join — enter a game code. */

import { JoinForm } from '@/components/game/JoinForm'

export default function JoinPage() {
  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Join a game</h1>
        <p className="text-sm text-muted-foreground">Enter the code on the host's screen.</p>
        <JoinForm autoFocus />
      </div>
    </div>
  )
}
