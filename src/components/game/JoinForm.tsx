import { useState, type FormEvent } from 'react'
import { Button, Input, Label } from '@/components/ui'
import { JOIN_CODE_LENGTH, normalizeJoinCode } from '@/lib/game'
import { useNavigate } from '@/router'

/** Six-character code entry → /play/:code (which runs the joinGame action). */
export function JoinForm({ autoFocus }: { autoFocus?: boolean }) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (code.length === JOIN_CODE_LENGTH) navigate('/play/:code', { params: { code } })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Label htmlFor="code">Game code</Label>
      <Input
        id="code"
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={code}
        placeholder="ABC123"
        className="h-14 text-center font-display text-2xl font-semibold tracking-[0.3em] uppercase"
        onChange={(e) => setCode(normalizeJoinCode(e.target.value))}
      />
      <Button type="submit" size="lg" disabled={code.length !== JOIN_CODE_LENGTH}>Join</Button>
    </form>
  )
}
