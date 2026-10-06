type CountedPage<T> = {
  data: T[] | null;
  error: { code: string } | null;
  count: number | null;
};

export async function readCountedPage<T>(
  query: PromiseLike<CountedPage<T>>,
  offset: number,
  countQuery: () => PromiseLike<{ error: unknown; count: number | null }>,
): Promise<CountedPage<T>> {
  const result = await query;
  if (result.error?.code !== "PGRST103") return result;
  // PostgREST returns 416 for a valid offset beyond the last row. Recheck the
  // same filtered collection before treating this as an empty page.
  const count = await countQuery();
  if (count.error || count.count === null || !Number.isSafeInteger(count.count) || count.count < 0 || offset < count.count) return result;
  return { data: [], error: null, count: count.count };
}
