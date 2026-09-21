// Supabase shim — produção ready para 01/out
// 1) Crie projeto em supabase.com
// 2) Defina envs na Vercel: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
// 3) Rode supabase/schema.sql

export const supabaseReady = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export function getSupabaseEnvStatus() {
  return {
    ready: supabaseReady,
    urlSet: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonSet: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    nextSteps: supabaseReady ? "Conectado" : "Defina envs na Vercel e redeploy",
  };
}
