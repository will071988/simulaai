import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anon) {
  console.warn("Supabase env faltando — defina NEXT_PUBLIC_SUPABASE_URL / ANON_KEY");
}

export const supabase = createClient(url, anon);

export const supabaseReady = !!(url && anon);

export function getSupabaseEnvStatus() {
  return {
    ready: supabaseReady,
    urlSet: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonSet: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    nextSteps: supabaseReady ? "Conectado ukwulespvvthyjqgrjfo" : "Defina envs na Vercel e redeploy",
  };
}
