import { APP_NAME } from '../constants'

/** Logo mark (four answer tiles) + name, set in the display face. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
      <span aria-hidden className="grid size-6 grid-cols-2 gap-0.5 rounded-md bg-primary p-1">
        <span className="rounded-[2px] bg-primary-foreground" />
        <span className="rounded-[2px] bg-primary-foreground opacity-70" />
        <span className="rounded-[2px] bg-primary-foreground opacity-70" />
        <span className="rounded-[2px] bg-primary-foreground opacity-40" />
      </span>
      {APP_NAME}
    </span>
  )
}
