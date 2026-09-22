export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  // constant-time compare
  if (token.length !== secret.length) return false;
  let ok = 0;
  for (let i = 0; i < token.length; i++) ok |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return ok === 0;
}
