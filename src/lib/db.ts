/**
 * Thin D1 helpers. All queries use bound parameters — never string interpolation.
 */
export async function one<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  const row = await db.prepare(sql).bind(...params).first<T>()
  return (row as T | null) ?? null
}

export async function many<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const res = await db.prepare(sql).bind(...params).all<T>()
  return res.results ?? []
}

export async function run(db: D1Database, sql: string, ...params: unknown[]): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run()
}

export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
}

export function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
}

/** Strip sensitive columns before sending rows to the client. */
export function omit<T extends Record<string, unknown>, K extends keyof T>(row: T, keys: K[]): Omit<T, K> {
  const out = { ...row }
  for (const k of keys) delete out[k]
  return out
}
