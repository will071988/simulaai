import { loadEnvConfig } from "@next/env";
import { supabaseService } from "../src/lib/supabase-server";
import { recalculateHotScores } from "../src/lib/collector/recalculateHotScores";

loadEnvConfig(process.cwd());

async function main() {
  const updated = await recalculateHotScores(supabaseService());
  console.log(`recalculated hot scores: ${updated}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
