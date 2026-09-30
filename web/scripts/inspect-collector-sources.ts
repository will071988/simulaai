import { adapters } from "../src/lib/collector/adapters";

async function main() {
  for (const source of adapters.filter((adapter) => ["FCC", "Cesgranrio", "FGV", "JC Concursos"].includes(adapter.sourceName))) {
    try {
      const documents = await source.discover();
      console.log(JSON.stringify({ source: source.sourceName, tier: source.tier, count: documents.length, documents: documents.slice(0, 3).map((doc) => ({ title: doc.title, url: doc.canonicalUrl })) }));
    } catch (error) {
      console.log(JSON.stringify({ source: source.sourceName, errorCode: error instanceof Error ? error.message : "DISCOVERY_FAILED" }));
    }
  }
}
main().catch(() => { console.error("SOURCE_INSPECTION_FAILED"); process.exitCode = 1; });
