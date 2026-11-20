import { getAuthToken } from 'deepspace'

/** POST to a server action with the caller's JWT. Throws with the action's error message. */
export async function callAction<T = unknown>(name: string, params: Record<string, unknown>): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('You are signed out. Sign in and try again.')
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  })
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: string }
  if (!res.ok || !body.success) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body.data as T
}
