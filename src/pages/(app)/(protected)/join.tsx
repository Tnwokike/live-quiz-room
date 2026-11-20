/** /join — enter a game code. */

import { useState, type FormEvent } from 'react'
import { Button, Input, Label } from '@/components/ui'
import { JOIN_CODE_LENGTH, normalizeJoinCode } from '@/lib/game'
import { useNavigate } from '@/router'

export default function JoinPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (code.length === JOIN_CODE_LENGTH) navigate('/play/:code', { params: { code } })
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Join a game</h1>
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">Game code</Label>
          <Input
            id="code"
            autoFocus
            autoComplete="off"
            inputMode="text"
            value={code}
            placeholder="ABC123"
            className="h-14 text-center font-mono text-2xl tracking-[0.3em] uppercase"
            onChange={(e) => setCode(normalizeJoinCode(e.target.value))}
          />
        </div>
        <Button type="submit" size="lg" disabled={code.length !== JOIN_CODE_LENGTH}>Join</Button>
      </form>
    </div>
  )
}
