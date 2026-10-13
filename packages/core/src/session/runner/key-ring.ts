export * as KeyRing from "./key-ring"

export const EXHAUSTED_TTL = 5 * 60 * 1000

const exhausted = new Map<string, number>()
const lastUsed = new Map<string, string>()

export function pick(prefix: string, keys: readonly string[]): string | undefined {
  if (keys.length === 0) return undefined
  const now = Date.now()
  for (const [key, until] of exhausted) {
    if (until <= now) exhausted.delete(key)
  }
  const candidates = keys.filter((k) => !exhausted.has(k))
  const chosen = candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : keys[0]
  lastUsed.set(prefix, chosen)
  return chosen
}

export function exhaustPrefix(prefix: string, ttlMs?: number): void {
  const key = lastUsed.get(prefix)
  if (key) {
    exhausted.set(key, Date.now() + (ttlMs && ttlMs > 0 ? ttlMs : EXHAUSTED_TTL))
    lastUsed.delete(prefix)
  }
}

export function reset(): void {
  exhausted.clear()
  lastUsed.clear()
}
