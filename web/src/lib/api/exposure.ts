const SENSITIVE_KEYS = new Set(["raw_text", "supabase_service_role_key", "cron_secret", "connection_string", "database_url", "env"]);

export function findSensitivePaths(value: unknown, path = "$", found: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitivePaths(item, `${path}[${index}]`, found));
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (SENSITIVE_KEYS.has(normalized) || normalized.includes("service_role") || normalized.includes("password")) found.push(`${path}.${key}`);
    findSensitivePaths(nested, `${path}.${key}`, found);
  }
  return found;
}
