export function pendingLimit(request: Request): 1 | 5 | null {
  const values = new URL(request.url).searchParams.getAll("limit");
  if (!values.length) return 5;
  if (values.length !== 1) return null;
  return values[0] === "1" ? 1 : values[0] === "5" ? 5 : null;
}

export function pendingClaimArguments(limit: 1 | 5): { p_limit: 1 | 5 } {
  return { p_limit: limit };
}
