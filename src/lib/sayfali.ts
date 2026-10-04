// Supabase (PostgREST) tek istekte en çok max_rows (1000) satır döndürür: büyük sorgular sayfa sayfa okunur.
/** Sayfalı okuma (PostgREST max_rows sınırı: tek istek en çok 1000 satır döner). */
export async function pages<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, size = 1000, cap = 50000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < cap; from += size) {
    const { data, error } = await build(from, from + size - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < size) break
  }
  return out
}

